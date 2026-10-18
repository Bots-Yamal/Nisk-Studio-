const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = "n.";
const COLOR = 0xFFD54A;

if (!TOKEN) {
  console.error("❌ Falta DISCORD_TOKEN en las variables de entorno.");
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, "data.json");

/* =========================================================
   BASE DE DATOS JSON
========================================================= */

let db = {};

function loadDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
    }

    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("Error cargando data.json:", error);
    db = {};
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("Error guardando data.json:", error);
  }
}

function createGuildData() {
  return {
    staffRole: null,

    channels: {
      welcome: null,
      invites: null,
      generalLogs: null,
      moderationLogs: null,
      ticketLogs: null,
      transactionLogs: null,
      levelLogs: null
    },

    ticketCategory: null,

    ticketTypes: [
      {
        name: "Soporte",
        questions: ["¿En qué te podemos ayudar?"]
      }
    ],

    autoroles: [],

    warns: {},

    tickets: {},

    invites: {
      users: {}
    },

    levels: {
      enabled: true,
      channel: null,
      xpPerMessage: 10,
      cooldown: 60,
      message: "🎉 ¡Felicidades {usuario}! Has alcanzado el nivel **{nivel}**.",
      roles: {}
    },

    users: {},

    giveaways: {}
  };
}

function guildDB(guildId) {
  if (!db[guildId]) {
    db[guildId] = createGuildData();
    saveDB();
  }

  const data = db[guildId];

  // Compatibilidad por si falta alguna propiedad
  const defaults = createGuildData();

  for (const key of Object.keys(defaults)) {
    if (data[key] === undefined) {
      data[key] = defaults[key];
    }
  }

  if (!data.channels) data.channels = defaults.channels;

  for (const key of Object.keys(defaults.channels)) {
    if (data.channels[key] === undefined) {
      data.channels[key] = null;
    }
  }

  if (!Array.isArray(data.ticketTypes)) {
    data.ticketTypes = defaults.ticketTypes;
  }

  if (!data.levels) {
    data.levels = defaults.levels;
  }

  saveDB();

  return data;
}

loadDB();

/* =========================================================
   CLIENTE
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.User
  ]
});

/* =========================================================
   HELPERS
========================================================= */

function yellowEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: "Nisk Studio | Programación"
    });
}

function isRealAdmin(member) {
  if (!member) return false;

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.id === member.guild.ownerId
  );
}

function isStaff(member) {
  if (!member) return false;

  if (isRealAdmin(member)) return true;

  const data = guildDB(member.guild.id);

  if (!data.staffRole) return false;

  return member.roles.cache.has(data.staffRole);
}

function cleanName(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function sendLog(guild, type, embed) {
  try {
    const data = guildDB(guild.id);

    const channelId = data.channels[type];

    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);

    if (!channel) return;

    await channel.send({
      embeds: [embed]
    });
  } catch (error) {
    console.error("Error enviando log:", error);
  }
}

function getLevelData(guild, userId) {
  const data = guildDB(guild.id);

  if (!data.users[userId]) {
    data.users[userId] = {
      xp: 0,
      level: 0,
      lastXP: 0
    };
  }

  return data.users[userId];
}

function xpNeeded(level) {
  return 100 + level * 50;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);

  return parts.length ? parts.join(" ") : "menos de 1m";
}

function findTicketByChannel(guild, channelId) {
  const data = guildDB(guild.id);

  return Object.values(data.tickets).find(
    ticket => ticket.channelId === channelId
  );
}

function getTicketId() {
  return Date.now().toString(36);
}

function parseQuestions(text) {
  return text
    .split("|")
    .map(q => q.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/* =========================================================
   INVITES
========================================================= */

const inviteCache = new Map();

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();

    const data = {};

    invites.forEach(invite => {
      data[invite.code] = invite.uses || 0;
    });

    inviteCache.set(guild.id, data);
  } catch (error) {
    console.log(`No se pudieron obtener invites de ${guild.name}`);
  }
}

function findUsedInvite(guild, newInvites) {
  const oldInvites = inviteCache.get(guild.id) || {};

  for (const invite of newInvites.values()) {
    const oldUses = oldInvites[invite.code] || 0;
    const newUses = invite.uses || 0;

    if (newUses > oldUses) {
      return invite;
    }
  }

  return null;
}

/* =========================================================
   REGISTRO DE SLASH COMMANDS
========================================================= */

const commands = [
  new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Abre el panel de administración.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("staff")
    .setDescription("Configura el rol de staff.")
    .addRoleOption(option =>
      option
        .setName("rol")
        .setDescription("Rol que será considerado staff.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("addcategory")
    .setDescription("Añade una categoría de tickets.")
    .addStringOption(option =>
      option
        .setName("nombre")
        .setDescription("Nombre de la categoría.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("preguntas")
        .setDescription("Preguntas separadas por |")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("removecategory")
    .setDescription("Elimina una categoría de tickets.")
    .addStringOption(option =>
      option
        .setName("nombre")
        .setDescription("Nombre de la categoría.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Envía el panel de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("ticketcategory")
    .setDescription("Configura la categoría de Discord donde se crearán los tickets.")
    .addChannelOption(option =>
      option
        .setName("categoria")
        .setDescription("Categoría de Discord.")
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configura el canal de bienvenida.")
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal de bienvenida.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Configura el canal de invitaciones.")
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal de invitaciones.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Añade un autorol.")
    .addRoleOption(option =>
      option
        .setName("rol")
        .setDescription("Rol automático.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("autorole-remove")
    .setDescription("Elimina un autorol.")
    .addRoleOption(option =>
      option
        .setName("rol")
        .setDescription("Rol.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configura un canal de logs.")
    .addStringOption(option =>
      option
        .setName("tipo")
        .setDescription("Tipo de logs.")
        .setRequired(true)
        .addChoices(
          { name: "General", value: "generalLogs" },
          { name: "Moderación", value: "moderationLogs" },
          { name: "Tickets", value: "ticketLogs" },
          { name: "Transacciones", value: "transactionLogs" },
          { name: "Niveles", value: "levelLogs" }
        )
    )
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal de logs.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("levels")
    .setDescription("Configura el sistema de niveles.")
    .addBooleanOption(option =>
      option
        .setName("activo")
        .setDescription("Activar o desactivar niveles.")
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal para mensajes de subida de nivel.")
    )
    .addIntegerOption(option =>
      option
        .setName("xp")
        .setDescription("XP por mensaje.")
        .setMinValue(1)
        .setMaxValue(1000)
    )
    .addIntegerOption(option =>
      option
        .setName("cooldown")
        .setDescription("Cooldown en segundos.")
        .setMinValue(0)
        .setMaxValue(3600)
    )
    .addStringOption(option =>
      option
        .setName("mensaje")
        .setDescription("Mensaje. Usa {usuario} y {nivel}.")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Muestra tu nivel."),

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Envía un embed.")
    .addStringOption(option =>
      option
        .setName("mensaje")
        .setDescription("Contenido del embed.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("color")
        .setDescription("Color hexadecimal, por ejemplo #FFD54A.")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Registra una transacción.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("cantidad")
        .setDescription("Cantidad.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("concepto")
        .setDescription("Concepto.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("invitescheck")
    .setDescription("Consulta las invitaciones de un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario.")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banea un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("razon")
        .setDescription("Razón.")
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("razon")
        .setDescription("Razón.")
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Silencia temporalmente un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario.")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutos")
        .setDescription("Duración.")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("razon")
        .setDescription("Razón.")
    ),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Quita el timeout.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario.")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Elimina mensajes.")
    .addIntegerOption(option =>
      option
        .setName("cantidad")
        .setDescription("Cantidad.")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Advierte a un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("razon")
        .setDescription("Razón.")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Muestra las advertencias.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario.")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("sorteo")
    .setDescription("Crea un sorteo.")
    .addStringOption(option =>
      option
        .setName("duracion")
        .setDescription("Ejemplo: 10m, 1h, 2d.")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("ganadores")
        .setDescription("Número de ganadores.")
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("premio")
        .setDescription("Premio.")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("invitaciones")
        .setDescription("Invitaciones mínimas.")
        .setMinValue(0)
        .setMaxValue(100)
    )
    .addIntegerOption(option =>
      option
        .setName("nivel")
        .setDescription("Nivel mínimo.")
        .setMinValue(0)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("reroll")
    .setDescription("Elige un nuevo ganador de un sorteo.")
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("ID del sorteo.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(command => command.toJSON());

/* =========================================================
   READY
========================================================= */

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} está conectado.`);
  console.log(`📌 Servidores: ${client.guilds.cache.size}`);

  client.user.setPresence({
    activities: [
      {
        name: "Nisk Studio 💛",
        type: 3
      }
    ],
    status: "online"
  });

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("✅ Slash commands registrados.");
  } catch (error) {
    console.error("Error registrando slash commands:", error);
  }

  for (const guild of client.guilds.cache.values()) {
    await cacheGuildInvites(guild);
  }
});

/* =========================================================
   MIEMBRO ENTRA
========================================================= */

client.on("guildMemberAdd", async member => {
  const data = guildDB(member.guild.id);

  /* AUTOROLES */

  for (const roleId of data.autoroles) {
    try {
      const role = member.guild.roles.cache.get(roleId);

      if (role && role.position < member.guild.members.me.roles.highest.position) {
        await member.roles.add(role);
      }
    } catch {}
  }

  /* INVITE */

  let inviter = null;
  let usedInvite = null;

  try {
    const invites = await member.guild.invites.fetch();

    usedInvite = findUsedInvite(member.guild, invites);

    inviteCache.set(
      member.guild.id,
      Object.fromEntries(
        invites.map(invite => [invite.code, invite.uses || 0])
      )
    );

    if (usedInvite && usedInvite.inviter) {
      inviter = usedInvite.inviter;
    }
  } catch {}

  if (inviter) {
    if (!data.invites.users[inviter.id]) {
      data.invites.users[inviter.id] = {
        total: 0,
        active: 0,
        left: 0,
        members: []
      };
    }

    const info = data.invites.users[inviter.id];

    info.total++;
    info.active++;
    info.members.push(member.id);

    saveDB();
  }

  /* WELCOME */

  if (data.channels.welcome) {
    const channel = member.guild.channels.cache.get(data.channels.welcome);

    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setDescription(
`╭・✦・────────────・✦・╮
　　　💛 NISK STUDIO
╰・✦・────────────・✦・╯

👋・¡Bienvenido/a ${member}!

Nos alegra tenerte en Nisk Studio, una comunidad donde podrás hablar, compartir y aprender sobre programación, bots, juegos y mucho más.

📌・Lee las reglas para evitar problemas.
💬・Participa y conoce a la comunidad.
💻・Comparte tus proyectos e ideas.
🎮・Diviértete y pasa un buen rato.

Esperamos que disfrutes tu estancia y formes parte de esta comunidad. 💛

╭・──────────────・╮
　✨ ¡Gracias por unirte!
╰・──────────────・╯`
        )
        .setTimestamp()
        .setFooter({
          text: "Nisk Studio | Programación"
        });

      await channel.send({
        embeds: [embed]
      });
    }
  }

  /* INVITE ANNOUNCEMENT */

  if (inviter && data.channels.invites) {
    const channel = member.guild.channels.cache.get(data.channels.invites);

    if (channel) {
      const info = data.invites.users[inviter.id];

      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("💛・¡Nueva invitación!")
        .setDescription(
`👤・${member} se ha unido a Nisk Studio.

🔗・Invitado por: ${inviter}
✨・${inviter} ahora tiene **${info.total}** invitaciones.
👥・Ya somos **${member.guild.memberCount}** miembros.

Gracias por ayudar a crecer la comunidad. 💛`
        )
        .setTimestamp();

      await channel.send({
        embeds: [embed]
      });
    }
  }

  await sendLog(
    member.guild,
    "generalLogs",
    yellowEmbed(
      "👋 Nuevo miembro",
      `**Usuario:** ${member}\n**ID:** \`${member.id}\``
    )
  );
});

/* =========================================================
   MIEMBRO SALE
========================================================= */

client.on("guildMemberRemove", async member => {
  const data = guildDB(member.guild.id);

  for (const userId of Object.keys(data.invites.users)) {
    const info = data.invites.users[userId];

    if (info.members && info.members.includes(member.id)) {
      info.active = Math.max(0, info.active - 1);
      info.left++;

      saveDB();
      break;
    }
  }

  await sendLog(
    member.guild,
    "generalLogs",
    yellowEmbed(
      "📤 Miembro salió",
      `**Usuario:** ${member.user.tag}\n**ID:** \`${member.id}\``
    )
  );
});

/* =========================================================
   SISTEMA DE NIVELES
========================================================= */

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const data = guildDB(message.guild.id);

  if (!data.levels.enabled) return;

  const userData = getLevelData(message.guild, message.author.id);

  const now = Date.now();
  const cooldown = Number(data.levels.cooldown || 60) * 1000;

  if (now - userData.lastXP < cooldown) return;

  userData.lastXP = now;

  const xpAmount = Number(data.levels.xpPerMessage || 10);

  userData.xp += xpAmount;

  let leveledUp = false;

  while (userData.xp >= xpNeeded(userData.level)) {
    userData.xp -= xpNeeded(userData.level);
    userData.level++;
    leveledUp = true;
  }

  saveDB();

  if (leveledUp) {
    const levelMessage = String(data.levels.message)
      .replaceAll("{usuario}", message.author.toString())
      .replaceAll("{nivel}", userData.level);

    const channel =
      (data.levels.channel &&
        message.guild.channels.cache.get(data.levels.channel)) ||
      message.channel;

    await channel.send({
      embeds: [
        yellowEmbed(
          "🎉 ¡Nuevo nivel!",
          levelMessage
        )
      ]
    });

    await sendLog(
      message.guild,
      "levelLogs",
      yellowEmbed(
        "📈 Subida de nivel",
        `${message.author} ha alcanzado el nivel **${userData.level}**.`
      )
    );

    const roleId = data.levels.roles[String(userData.level)];

    if (roleId) {
      const role = message.guild.roles.cache.get(roleId);

      if (role) {
        try {
          await message.member.roles.add(role);
        } catch {}
      }
    }
  }
});

/* =========================================================
   PREFIX COMMANDS
========================================================= */

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.toLowerCase().startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (!command) return;

  const data = guildDB(message.guild.id);

  /* ================= ADMIN ================= */

  if (command === "admin") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo los administradores pueden usar este panel.");
    }

    return sendAdminPanel(message);
  }

  /* ================= STAFF ================= */

  if (command === "staff") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo los administradores pueden configurar el staff.");
    }

    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply("Uso: `n.staff @Rol`");
    }

    data.staffRole = role.id;
    saveDB();

    return message.reply({
      embeds: [
        yellowEmbed(
          "🛡️ Staff configurado",
          `El rol ${role} ahora es el rol de **Staff**.`
        )
      ]
    });
  }

  /* ================= ADD CATEGORY ================= */

  if (command === "addcategory") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores.");
    }

    const raw = message.content
      .slice(PREFIX.length + command.length)
      .trim();

    const parts = raw
      .split("|")
      .map(x => x.trim())
      .filter(Boolean);

    const name = parts.shift();

    if (!name || parts.length === 0) {
      return message.reply(
        "Uso:\n`n.addcategory Soporte | ¿En qué te puedo ayudar?`\n\nPuedes añadir hasta 5 preguntas."
      );
    }

    const questions = parts.slice(0, 5);

    data.ticketTypes = data.ticketTypes.filter(
      category =>
        category.name.toLowerCase() !== name.toLowerCase()
    );

    data.ticketTypes.push({
      name,
      questions
    });

    saveDB();

    return message.reply({
      embeds: [
        yellowEmbed(
          "🎫 Categoría añadida",
          `**Nombre:** ${name}\n\n${questions
            .map((q, i) => `**${i + 1}.** ${q}`)
            .join("\n")}`
        )
      ]
    });
  }

  /* ================= REMOVE CATEGORY ================= */

  if (command === "removecategory") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores.");
    }

    const name = args.join(" ");

    if (!name) {
      return message.reply("Uso: `n.removecategory Soporte`");
    }

    const oldLength = data.ticketTypes.length;

    data.ticketTypes = data.ticketTypes.filter(
      category =>
        category.name.toLowerCase() !== name.toLowerCase()
    );

    if (data.ticketTypes.length === oldLength) {
      return message.reply("❌ No existe esa categoría.");
    }

    saveDB();

    return message.reply(`✅ Categoría **${name}** eliminada.`);
  }

  /* ================= TICKET PANEL ================= */

  if (command === "ticketpanel") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores.");
    }

    return sendTicketPanel(message.channel);
  }

  /* ================= TICKET CATEGORY ================= */

  if (command === "ticketcategory") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores.");
    }

    const category = message.mentions.channels.first();

    if (!category || category.type !== ChannelType.GuildCategory) {
      return message.reply(
        "Uso: `n.ticketcategory #categoria`"
      );
    }

    data.ticketCategory = category.id;
    saveDB();

    return message.reply(
      `✅ Los tickets se crearán dentro de ${category}.`
    );
  }

  /* ================= WELCOME ================= */

  if (command === "welcome") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores.");
    }

    const channel = message.mentions.channels.first();

    if (!channel) {
      return message.reply("Uso: `n.welcome #canal`");
    }

    data.channels.welcome = channel.id;
    saveDB();

    return message.reply(
      `✅ Canal de bienvenida configurado: ${channel}`
    );
  }

  /* ================= INVITE ================= */

  if (command === "invite") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores.");
    }

    const channel = message.mentions.channels.first();

    if (!channel) {
      return message.reply("Uso: `n.invite #canal`");
    }

    data.channels.invites = channel.id;
    saveDB();

    return message.reply(
      `✅ Canal de invitaciones configurado: ${channel}`
    );
  }

  /* ================= INVITES CHECK ================= */

  if (command === "invitescheck") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permiso.");
    }

    const user =
      message.mentions.users.first() ||
      message.author;

    return sendInviteStats(message, user);
  }

  /* ================= AUTOROLE ================= */

  if (command === "autorole") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores.");
    }

    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply("Uso: `n.autorole @Rol`");
    }

    if (!data.autoroles.includes(role.id)) {
      data.autoroles.push(role.id);
    }

    saveDB();

    return message.reply(
      `✅ ${role} añadido como autorol.`
    );
  }

  if (command === "autorole-remove") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores.");
    }

    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply("Uso: `n.autorole-remove @Rol`");
    }

    data.autoroles = data.autoroles.filter(
      id => id !== role.id
    );

    saveDB();

    return message.reply(
      `✅ ${role} eliminado de los autoroles.`
    );
  }

  /* ================= EMBED ================= */

  if (command === "embed") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply("❌ No tienes permiso.");
    }

    const raw = message.content
      .slice(PREFIX.length + command.length)
      .trim();

    const firstSpace = raw.indexOf(" ");

    if (firstSpace === -1) {
      return message.reply(
        "Uso: `n.embed #FFD54A Tu mensaje`"
      );
    }

    const colorText = raw.slice(0, firstSpace);
    const content = raw.slice(firstSpace + 1);

    let color = COLOR;

    if (/^#[0-9A-F]{6}$/i.test(colorText)) {
      color = parseInt(colorText.slice(1), 16);
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(content)
      .setTimestamp();

    const attachment = message.attachments.first();

    if (attachment) {
      embed.setImage(attachment.url);
    }

    return message.channel.send({
      embeds: [embed]
    });
  }

  /* ================= PAY ================= */

  if (command === "pay") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permiso.");
    }

    const user = message.mentions.users.first();

    const withoutMention = args
      .filter(x => !x.startsWith("<@"))
      .join(" ");

    const split = withoutMention.split(" ");

    const amount = split.shift();
    const concept = split.join(" ");

    if (!user || !amount || !concept) {
      return message.reply(
        "Uso: `n.pay @usuario cantidad concepto`"
      );
    }

    const embed = yellowEmbed(
      "💳 Transacción registrada",
      `👤 **Usuario:** ${user}
💰 **Cantidad:** ${amount}
📝 **Concepto:** ${concept}
👮 **Registrado por:** ${message.author}`
    );

    await message.channel.send({
      embeds: [embed]
    });

    await sendLog(
      message.guild,
      "transactionLogs",
      embed
    );

    return;
  }

  /* ================= RANK ================= */

  if (command === "rank") {
    return sendRank(message, message.author);
  }

  /* ================= PURGE ================= */

  if (command === "purge") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permiso.");
    }

    const amount = Number(args[0]);

    if (!amount || amount < 1 || amount > 100) {
      return message.reply(
        "Uso: `n.purge 1-100`"
      );
    }

    await message.channel.bulkDelete(amount, true);

    return message.channel.send(
      `🧹 Se eliminaron **${amount}** mensajes.`
    ).then(msg => {
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    });
  }

  /* ================= BAN ================= */

  if (command === "ban") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permiso.");
    }

    const member =
      message.mentions.members.first();

    if (!member) {
      return message.reply("Uso: `n.ban @usuario razón`");
    }

    const reason =
      args.slice(1).join(" ") || "Sin razón especificada";

    await member.ban({ reason });

    await message.channel.send(
      `🔨 ${member.user.tag} ha sido baneado.\n**Razón:** ${reason}`
    );

    return;
  }

  /* ================= KICK ================= */

  if (command === "kick") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permiso.");
    }

    const member =
      message.mentions.members.first();

    if (!member) {
      return message.reply("Uso: `n.kick @usuario razón`");
    }

    const reason =
      args.slice(1).join(" ") || "Sin razón especificada";

    await member.kick(reason);

    return message.channel.send(
      `👢 ${member.user.tag} ha sido expulsado.\n**Razón:** ${reason}`
    );
  }

  /* ================= MUTE ================= */

  if (command === "mute") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permiso.");
    }

    const member =
      message.mentions.members.first();

    const minutes = Number(
      args.find(x => !x.includes("<@"))
    );

    if (!member || !minutes) {
      return message.reply(
        "Uso: `n.mute @usuario minutos razón`"
      );
    }

    const reason =
      args.slice(2).join(" ") || "Sin razón especificada";

    await member.timeout(
      minutes * 60 * 1000,
      reason
    );

    return message.channel.send(
      `🔇 ${member.user.tag} ha sido silenciado durante **${minutes} minutos**.`
    );
  }

  /* ================= UNMUTE ================= */

  if (command === "unmute") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permiso.");
    }

    const member =
      message.mentions.members.first();

    if (!member) {
      return message.reply("Uso: `n.unmute @usuario`");
    }

    await member.timeout(null);

    return message.channel.send(
      `🔊 Se quitó el silencio a ${member}.`
    );
  }

  /* ================= WARN ================= */

  if (command === "warn") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permiso.");
    }

    const user =
      message.mentions.users.first();

    const reason =
      args.slice(1).join(" ");

    if (!user || !reason) {
      return message.reply(
        "Uso: `n.warn @usuario razón`"
      );
    }

    if (!data.warns[user.id]) {
      data.warns[user.id] = [];
    }

    data.warns[user.id].push({
      reason,
      moderator: message.author.id,
      date: Date.now()
    });

    saveDB();

    return message.channel.send(
      `⚠️ ${user} recibió una advertencia.\n**Razón:** ${reason}`
    );
  }

  /* ================= WARNINGS ================= */

  if (command === "warnings") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permiso.");
    }

    const user =
      message.mentions.users.first();

    if (!user) {
      return message.reply(
        "Uso: `n.warnings @usuario`"
      );
    }

    const warnings =
      data.warns[user.id] || [];

    if (!warnings.length) {
      return message.reply(
        `✅ ${user} no tiene advertencias.`
      );
    }

    const text = warnings
      .map(
        (w, i) =>
          `**${i + 1}.** ${w.reason}\n👮 <@${w.moderator}> • <t:${Math.floor(w.date / 1000)}:R>`
      )
      .join("\n\n");

    return message.reply({
      embeds: [
        yellowEmbed(
          `⚠️ Advertencias de ${user.tag}`,
          text
        )
      ]
    });
  }

  /* ================= SORTEO ================= */

  if (command === "sorteo") {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply("❌ No tienes permiso.");
    }

    const durationText = args.shift();
    const winners = Number(args.shift());
    const prize = args.join(" ");

    if (!durationText || !winners || !prize) {
      return message.reply(
        "Uso: `n.sorteo 1h 1 Premio increíble`"
      );
    }

    const duration = parseDuration(durationText);

    if (!duration) {
      return message.reply(
        "❌ Duración inválida. Ejemplo: `10m`, `1h`, `2d`."
      );
    }

    return createGiveaway(
      message,
      duration,
      winners,
      prize,
      0,
      0
    );
  }
});

/* =========================================================
   ADMIN PANEL
========================================================= */

async function sendAdminPanel(target) {
  const embed = yellowEmbed(
    "💛・NISK STUDIO | ADMIN",
`╭・✦・──────────────・✦・╮
        🛠️ PANEL DE ADMINISTRACIÓN
╰・✦・──────────────・✦・╯

Bienvenido al panel de administración de **Nisk Studio**.

Desde aquí puedes acceder rápidamente a las diferentes áreas del bot.

🎫・Tickets
Configura categorías, paneles y tickets.

🛡️・Moderación
Herramientas para mantener el servidor organizado.

📜・Logs
Configura los diferentes sistemas de registros.

👋・Welcome
Configura las bienvenidas.

🔗・Invites
Configura y consulta invitaciones.

📈・Niveles
Configura XP, canales y mensajes.

👤・Autoroles
Configura roles automáticos.

🎉・Sorteos
Gestiona los sorteos.

⚙️・Configuración
Consulta la configuración general.

Selecciona una sección usando los botones de abajo.`
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("admin_tickets")
      .setLabel("Tickets")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("admin_moderation")
      .setLabel("Moderación")
      .setEmoji("🛡️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("admin_logs")
      .setLabel("Logs")
      .setEmoji("📜")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("admin_welcome")
      .setLabel("Welcome")
      .setEmoji("👋")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("admin_invites")
      .setLabel("Invites")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("admin_levels")
      .setLabel("Niveles")
      .setEmoji("📈")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("admin_autoroles")
      .setLabel("Autoroles")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("admin_giveaways")
      .setLabel("Sorteos")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("admin_config")
      .setLabel("Configuración")
      .setEmoji("⚙️")
      .setStyle(ButtonStyle.Secondary)
  );

  if (target.reply) {
    return target.reply({
      embeds: [embed],
      components: [row1, row2]
    });
  }

  return target.channel.send({
    embeds: [embed],
    components: [row1, row2]
  });
}

/* =========================================================
   TICKET PANEL
========================================================= */

async function sendTicketPanel(channel) {
  const guild = channel.guild;
  const data = guildDB(guild.id);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("💛・NISK STUDIO | SOPORTE")
    .setDescription(
`╭・✦・──────────────・✦・╮
        🎫 CENTRO DE SOPORTE
╰・✦・──────────────・✦・╯

¿Necesitas ayuda?

Selecciona abajo la categoría que mejor describa tu solicitud.

Nuestro equipo revisará tu ticket lo antes posible.

📌 **Antes de abrir un ticket:**
• Explica claramente tu problema.
• Añade capturas si son necesarias.
• No abras tickets duplicados.
• Mantén el respeto hacia el equipo.
• Utiliza cada categoría correctamente.

💛 Gracias por formar parte de Nisk Studio.

Selecciona una categoría para comenzar.`
    )
    .setFooter({
      text: "Nisk Studio | Sistema de Tickets"
    })
    .setTimestamp();

  const options = data.ticketTypes
    .slice(0, 25)
    .map((category, index) => ({
      label: category.name.slice(0, 100),
      value: `ticket_category_${index}`,
      description: `Abrir un ticket de ${category.name}`.slice(0, 100),
      emoji: "🎫"
    }));

  if (!options.length) {
    return channel.send({
      embeds: [
        yellowEmbed(
          "❌ Sin categorías",
          "No hay categorías de tickets configuradas."
        )
      ]
    });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_category_select")
    .setPlaceholder("🎫 Selecciona una categoría")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);

  return channel.send({
    embeds: [embed],
    components: [row]
  });
}

/* =========================================================
   CREAR FORMULARIO DE TICKET
========================================================= */

async function showTicketModal(interaction, category, index) {
  const questions = category.questions.slice(0, 5);

  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_${index}`)
    .setTitle(`🎫 ${category.name}`.slice(0, 45));

  questions.forEach((question, i) => {
    const input = new TextInputBuilder()
      .setCustomId(`question_${i}`)
      .setLabel(question.slice(0, 45))
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Escribe tu respuesta...")
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  });

  await interaction.showModal(modal);
}

/* =========================================================
   CREAR TICKET
========================================================= */

async function createTicket(interaction, category, answers) {
  const guild = interaction.guild;
  const data = guildDB(guild.id);

  const existing = Object.values(data.tickets).find(
    ticket =>
      ticket.userId === interaction.user.id &&
      ticket.closed === false
  );

  if (existing) {
    return interaction.reply({
      content: `❌ Ya tienes un ticket abierto: <#${existing.channelId}>`,
      ephemeral: true
    });
  }

  const ticketId = getTicketId();

  const channelName =
    `${cleanName(category.name)}-${cleanName(interaction.user.username)}`
      .slice(0, 90);

  const permissionOverwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    }
  ];

  if (data.staffRole) {
    permissionOverwrites.push({
      id: data.staffRole,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    });
  }

  const channelOptions = {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites
  };

  if (data.ticketCategory) {
    const parent = guild.channels.cache.get(data.ticketCategory);

    if (parent && parent.type === ChannelType.GuildCategory) {
      channelOptions.parent = parent.id;
    }
  }

  const channel = await guild.channels.create(channelOptions);

  data.tickets[ticketId] = {
    id: ticketId,
    channelId: channel.id,
    userId: interaction.user.id,
    category: category.name,
    answers,
    createdAt: Date.now(),
    claimedBy: null,
    closed: false
  };

  saveDB();

  const answersText = answers
    .map(
      item =>
        `**❓ ${item.question}**\n💬 ${item.answer}`
    )
    .join("\n\n");

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`💛・NISK STUDIO | ${category.name.toUpperCase()}`)
    .setDescription(
`╭・✦・──────────────・✦・╮
        🎫 TICKET CREADO
╰・✦・──────────────・✦・╯

👋 ¡Hola ${interaction.user}!

Gracias por contactar con el equipo de **Nisk Studio**.

Un miembro del staff revisará tu solicitud lo antes posible.

╭・📋・ INFORMACIÓN
│
│ 👤 Usuario: ${interaction.user}
│ 🏷️ Categoría: **${category.name}**
│ 🟢 Estado: **Abierto**
│ 🕐 Creado: <t:${Math.floor(Date.now() / 1000)}:F>
│
╰・────────────────────・╯

### 📝 Información proporcionada

${answersText}

### 📌 Recomendaciones

• Explica cualquier información adicional que sea necesaria.
• Puedes enviar imágenes o archivos.
• Evita hacer spam o mencionar constantemente al staff.
• Mantén siempre el respeto.

💛 **El equipo de Nisk Studio estará contigo durante el proceso.**`
    )
    .setFooter({
      text: `Ticket #${ticketId} • Nisk Studio`
    })
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_claim_${ticketId}`)
      .setLabel("Reclamar")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`ticket_notify_${ticketId}`)
      .setLabel("Notificar staff")
      .setEmoji("🔔")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`ticket_close_${ticketId}`)
      .setLabel("Cerrar")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `${interaction.user}${data.staffRole ? ` <@&${data.staffRole}>` : ""}`,
    embeds: [embed],
    components: [buttons]
  });

  await interaction.reply({
    content: `✅ Tu ticket ha sido creado: ${channel}`,
    ephemeral: true
  });

  await sendLog(
    guild,
    "ticketLogs",
    yellowEmbed(
      "🎫 Ticket creado",
      `**Usuario:** ${interaction.user}\n**Categoría:** ${category.name}\n**Canal:** ${channel}\n**ID:** \`${ticketId}\``
    )
  );
}

/* =========================================================
   CERRAR TICKET
========================================================= */

async function closeTicket(interaction, ticketId, reason) {
  const data = guildDB(interaction.guild.id);
  const ticket = data.tickets[ticketId];

  if (!ticket) {
    return interaction.reply({
      content: "❌ No se encontró este ticket.",
      ephemeral: true
    });
  }

  if (ticket.closed) {
    return interaction.reply({
      content: "❌ Este ticket ya está cerrado.",
      ephemeral: true
    });
  }

  ticket.closed = true;
  ticket.closedAt = Date.now();
  ticket.closedBy = interaction.user.id;
  ticket.closeReason = reason;

  saveDB();

  const channel = interaction.channel;

  await channel.permissionOverwrites.edit(
    ticket.userId,
    {
      SendMessages: false
    }
  ).catch(() => {});

  const ratingRow = new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map(number =>
      new ButtonBuilder()
        .setCustomId(`ticket_rating_${ticketId}_${number}`)
        .setLabel(`${number}`)
        .setEmoji("⭐")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  await interaction.reply({
    embeds: [
      yellowEmbed(
        "🔒 Ticket cerrado",
        `Este ticket ha sido cerrado por ${interaction.user}.

**Motivo:**
${reason}

⭐ Si deseas valorar la atención recibida, selecciona una puntuación de 1 a 5.`
      )
    ],
    components: [ratingRow]
  });

  await sendLog(
    interaction.guild,
    "ticketLogs",
    yellowEmbed(
      "🔒 Ticket cerrado",
      `**Ticket:** \`${ticketId}\`
**Usuario:** <@${ticket.userId}>
**Cerrado por:** ${interaction.user}
**Motivo:** ${reason}
**Duración:** ${formatDuration(ticket.closedAt - ticket.createdAt)}`
    )
  );

  setTimeout(async () => {
    try {
      await channel.delete();
    } catch {}
  }, 60000);
}

/* =========================================================
   RATING
========================================================= */

async function rateTicket(interaction, ticketId, rating) {
  const data = guildDB(interaction.guild.id);
  const ticket = data.tickets[ticketId];

  if (!ticket) {
    return interaction.reply({
      content: "❌ Ticket no encontrado.",
      ephemeral: true
    });
  }

  if (interaction.user.id !== ticket.userId) {
    return interaction.reply({
      content: "❌ Solo el creador del ticket puede valorarlo.",
      ephemeral: true
    });
  }

  if (ticket.rating) {
    return interaction.reply({
      content: "❌ Ya has valorado este ticket.",
      ephemeral: true
    });
  }

  ticket.rating = rating;
  ticket.ratedAt = Date.now();

  saveDB();

  await interaction.update({
    embeds: [
      yellowEmbed(
        "⭐ Valoración recibida",
        `¡Gracias por valorar la atención con **${rating}/5 ⭐**!\n\nTu opinión ayuda a Nisk Studio a mejorar. 💛`
      )
    ],
    components: []
  });

  await sendLog(
    interaction.guild,
    "ticketLogs",
    yellowEmbed(
      "⭐ Nueva valoración",
      `**Usuario:** <@${ticket.userId}>
**Categoría:** ${ticket.category}
**Valoración:** ${rating}/5 ⭐
**Ticket:** \`${ticketId}\``
    )
  );
}

/* =========================================================
   GIVEAWAYS
========================================================= */

function parseDuration(text) {
  const match = /^(\d+)(s|m|h|d|w)$/i.exec(text);

  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };

  return value * multipliers[unit];
}

async function createGiveaway(
  message,
  duration,
  winners,
  prize,
  inviteRequirement = 0,
  levelRequirement = 0
) {
  const data = guildDB(message.guild.id);

  const id = Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase();

  const endAt = Date.now() + duration;

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("🎉・SORTEO")
    .setDescription(
`╭・✦・──────────────・✦・╮
          🎁 ${prize}
╰・✦・──────────────・✦・╯

🏆 **Ganadores:** ${winners}
⏰ **Finaliza:** <t:${Math.floor(endAt / 1000)}:R>
🆔 **Sorteo:** \`${id}\`

### 📋 Requisitos

${inviteRequirement > 0 ? `🔗 Invitaciones mínimas: **${inviteRequirement}**\n` : ""}${levelRequirement > 0 ? `📈 Nivel mínimo: **${levelRequirement}**\n` : ""}${inviteRequirement === 0 && levelRequirement === 0 ? "💛 No hay requisitos adicionales." : ""}

Pulsa el botón **🎉 Participar** para entrar.

¡Mucha suerte! 💛`
    )
    .setFooter({
      text: "Nisk Studio | Sorteos"
    })
    .setTimestamp(endAt);

  const button = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_join_${id}`)
      .setLabel("Participar")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Primary)
  );

  const sent = await message.channel.send({
    embeds: [embed],
    components: [button]
  });

  data.giveaways[id] = {
    id,
    channelId: message.channel.id,
    messageId: sent.id,
    prize,
    winners,
    endAt,
    inviteRequirement,
    levelRequirement,
    participants: [],
    ended: false,
    creator: message.author.id
  };

  saveDB();

  setTimeout(() => finishGiveaway(message.guild.id, id), duration);

  return;
}

async function finishGiveaway(guildId, giveawayId) {
  const guild = client.guilds.cache.get(guildId);

  if (!guild) return;

  const data = guildDB(guildId);
  const giveaway = data.giveaways[giveawayId];

  if (!giveaway || giveaway.ended) return;

  giveaway.ended = true;

  const channel = guild.channels.cache.get(giveaway.channelId);

  if (!channel) {
    saveDB();
    return;
  }

  let participants = giveaway.participants
    .map(id => guild.members.cache.get(id))
    .filter(Boolean);

  participants = participants.filter(member => {
    const levelData = getLevelData(guild, member.id);

    const inviteData =
      data.invites.users[member.id] || {
        total: 0
      };

    return (
      inviteData.total >= giveaway.inviteRequirement &&
      levelData.level >= giveaway.levelRequirement
    );
  });

  const winners = [];

  while (
    winners.length < giveaway.winners &&
    participants.length > 0
  ) {
    const index = Math.floor(
      Math.random() * participants.length
    );

    winners.push(
      participants.splice(index, 1)[0]
    );
  }

  const winnerText = winners.length
    ? winners.map(member => member.toString()).join(", ")
    : "No hubo ganadores.";

  await channel.send({
    embeds: [
      yellowEmbed(
        "🎉・SORTEO FINALIZADO",
        `### 🎁 Premio
**${giveaway.prize}**

### 🏆 Ganador(es)
${winnerText}

¡Felicidades! 💛`
      )
    ]
  });

  const oldMessage = await channel.messages
    .fetch(giveaway.messageId)
    .catch(() => null);

  if (oldMessage) {
    await oldMessage.edit({
      components: []
    }).catch(() => {});
  }

  saveDB();
}

/* =========================================================
   RANK
========================================================= */

async function sendRank(target, user) {
  const guild = target.guild;
  const data = guildDB(guild.id);

  const levelData = getLevelData(guild, user.id);

  const needed = xpNeeded(levelData.level);

  const embed = yellowEmbed(
    "📈・NISK STUDIO | NIVEL",
    `👤 **Usuario:** ${user}

🏆 **Nivel:** ${levelData.level}

✨ **XP:** ${levelData.xp}/${needed}

📊 **Progreso:** ${Math.floor(
      (levelData.xp / needed) * 100
    )}%`
  );

  if (target.reply) {
    return target.reply({
      embeds: [embed]
    });
  }

  return target.channel.send({
    embeds: [embed]
  });
}

/* =========================================================
   INVITE STATS
========================================================= */

async function sendInviteStats(target, user) {
  const data = guildDB(target.guild.id);

  const info =
    data.invites.users[user.id] || {
      total: 0,
      active: 0,
      left: 0
    };

  const embed = yellowEmbed(
    "🔗・INVITACIONES",
    `👤 **Usuario:** ${user}

👥 **Miembros invitados:** ${info.total}

🟢 **Actualmente en el servidor:** ${info.active}

🔴 **Se fueron:** ${info.left}

📊 **Total:** ${info.total}`
  );

  if (target.reply) {
    return target.reply({
      embeds: [embed]
    });
  }

  return target.channel.send({
    embeds: [embed]
  });
}

/* =========================================================
   INTERACCIONES
========================================================= */

client.on("interactionCreate", async interaction => {
  try {
    /* =====================================================
       SLASH COMMANDS
    ===================================================== */

    if (interaction.isChatInputCommand()) {
      const data = guildDB(interaction.guild.id);

      /* ADMIN */

      if (interaction.commandName === "admin") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        return sendAdminPanel(interaction);
      }

      /* STAFF */

      if (interaction.commandName === "staff") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const role =
          interaction.options.getRole("rol");

        data.staffRole = role.id;

        saveDB();

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "🛡️ Staff configurado",
              `El rol ${role} ahora es el rol de Staff.`
            )
          ]
        });
      }

      /* ADD CATEGORY */

      if (interaction.commandName === "addcategory") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const name =
          interaction.options.getString("nombre");

        const questionText =
          interaction.options.getString("preguntas");

        const questions =
          parseQuestions(questionText);

        data.ticketTypes = data.ticketTypes.filter(
          category =>
            category.name.toLowerCase() !==
            name.toLowerCase()
        );

        data.ticketTypes.push({
          name,
          questions
        });

        saveDB();

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "🎫 Categoría añadida",
              `**${name}**\n\n${questions
                .map(
                  (q, i) =>
                    `**${i + 1}.** ${q}`
                )
                .join("\n")}`
            )
          ]
        });
      }

      /* REMOVE CATEGORY */

      if (interaction.commandName === "removecategory") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const name =
          interaction.options.getString("nombre");

        const before = data.ticketTypes.length;

        data.ticketTypes = data.ticketTypes.filter(
          category =>
            category.name.toLowerCase() !==
            name.toLowerCase()
        );

        if (before === data.ticketTypes.length) {
          return interaction.reply({
            content: "❌ Esa categoría no existe.",
            ephemeral: true
          });
        }

        saveDB();

        return interaction.reply(
          `✅ Categoría **${name}** eliminada.`
        );
      }

      /* TICKET PANEL */

      if (interaction.commandName === "ticketpanel") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        await interaction.reply({
          content: "✅ Panel enviado.",
          ephemeral: true
        });

        return sendTicketPanel(interaction.channel);
      }

      /* TICKET CATEGORY */

      if (interaction.commandName === "ticketcategory") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const category =
          interaction.options.getChannel("categoria");

        data.ticketCategory = category.id;

        saveDB();

        return interaction.reply(
          `✅ Los tickets se crearán dentro de ${category}.`
        );
      }

      /* WELCOME */

      if (interaction.commandName === "welcome") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const channel =
          interaction.options.getChannel("canal");

        data.channels.welcome = channel.id;

        saveDB();

        return interaction.reply(
          `✅ Canal de bienvenida: ${channel}`
        );
      }

      /* INVITE */

      if (interaction.commandName === "invite") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const channel =
          interaction.options.getChannel("canal");

        data.channels.invites = channel.id;

        saveDB();

        return interaction.reply(
          `✅ Canal de invitaciones: ${channel}`
        );
      }

      /* AUTOROLE */

      if (interaction.commandName === "autorole") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const role =
          interaction.options.getRole("rol");

        if (!data.autoroles.includes(role.id)) {
          data.autoroles.push(role.id);
        }

        saveDB();

        return interaction.reply(
          `✅ ${role} configurado como autorol.`
        );
      }

      if (interaction.commandName === "autorole-remove") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const role =
          interaction.options.getRole("rol");

        data.autoroles =
          data.autoroles.filter(
            id => id !== role.id
          );

        saveDB();

        return interaction.reply(
          `✅ ${role} eliminado de los autoroles.`
        );
      }

      /* LOGS */

      if (interaction.commandName === "logs") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const type =
          interaction.options.getString("tipo");

        const channel =
          interaction.options.getChannel("canal");

        data.channels[type] = channel.id;

        saveDB();

        return interaction.reply(
          `✅ Canal de logs configurado: ${channel}`
        );
      }

      /* LEVELS */

      if (interaction.commandName === "levels") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const enabled =
          interaction.options.getBoolean("activo");

        const channel =
          interaction.options.getChannel("canal");

        const xp =
          interaction.options.getInteger("xp");

        const cooldown =
          interaction.options.getInteger("cooldown");

        const customMessage =
          interaction.options.getString("mensaje");

        data.levels.enabled = enabled;

        if (channel) {
          data.levels.channel = channel.id;
        }

        if (xp !== null) {
          data.levels.xpPerMessage = xp;
        }

        if (cooldown !== null) {
          data.levels.cooldown = cooldown;
        }

        if (customMessage) {
          data.levels.message = customMessage;
        }

        saveDB();

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "📈 Sistema de niveles configurado",
              `🟢 **Activo:** ${enabled ? "Sí" : "No"}
📺 **Canal:** ${
                data.levels.channel
                  ? `<#${data.levels.channel}>`
                  : "Canal actual"
              }
✨ **XP por mensaje:** ${data.levels.xpPerMessage}
⏱️ **Cooldown:** ${data.levels.cooldown}s
📝 **Mensaje:** ${data.levels.message}`
            )
          ]
        });
      }

      /* RANK */

      if (interaction.commandName === "rank") {
        return sendRank(
          interaction,
          interaction.user
        );
      }

      /* EMBED */

      if (interaction.commandName === "embed") {
        if (
          !interaction.member.permissions.has(
            PermissionFlagsBits.ManageMessages
          )
        ) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const content =
          interaction.options.getString("mensaje");

        const colorText =
          interaction.options.getString("color");

        let color = COLOR;

        if (
          colorText &&
          /^#[0-9A-F]{6}$/i.test(colorText)
        ) {
          color = parseInt(
            colorText.slice(1),
            16
          );
        }

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(color)
              .setDescription(content)
              .setTimestamp()
          ]
        });
      }

      /* PAY */

      if (interaction.commandName === "pay") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("usuario");

        const amount =
          interaction.options.getString("cantidad");

        const concept =
          interaction.options.getString("concepto");

        const embed = yellowEmbed(
          "💳 Transacción registrada",
          `👤 **Usuario:** ${user}
💰 **Cantidad:** ${amount}
📝 **Concepto:** ${concept}
👮 **Registrado por:** ${interaction.user}`
        );

        await interaction.reply({
          embeds: [embed]
        });

        return sendLog(
          interaction.guild,
          "transactionLogs",
          embed
        );
      }

      /* INVITES CHECK */

      if (interaction.commandName === "invitescheck") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("usuario");

        return sendInviteStats(
          interaction,
          user
        );
      }

      /* BAN */

      if (interaction.commandName === "ban") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("usuario");

        const reason =
          interaction.options.getString("razon") ||
          "Sin razón especificada";

        const member =
          interaction.guild.members.cache.get(
            user.id
          );

        if (!member) {
          return interaction.reply({
            content: "❌ Ese usuario no está en el servidor.",
            ephemeral: true
          });
        }

        await member.ban({ reason });

        return interaction.reply(
          `🔨 ${user.tag} ha sido baneado.\n**Razón:** ${reason}`
        );
      }

      /* KICK */

      if (interaction.commandName === "kick") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("usuario");

        const member =
          interaction.guild.members.cache.get(
            user.id
          );

        if (!member) {
          return interaction.reply({
            content: "❌ Ese usuario no está en el servidor.",
            ephemeral: true
          });
        }

        const reason =
          interaction.options.getString("razon") ||
          "Sin razón especificada";

        await member.kick(reason);

        return interaction.reply(
          `👢 ${user.tag} ha sido expulsado.`
        );
      }

      /* MUTE */

      if (interaction.commandName === "mute") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("usuario");

        const member =
          interaction.guild.members.cache.get(
            user.id
          );

        const minutes =
          interaction.options.getInteger("minutos");

        if (!member) {
          return interaction.reply({
            content: "❌ Usuario no encontrado.",
            ephemeral: true
          });
        }

        const reason =
          interaction.options.getString("razon") ||
          "Sin razón especificada";

        await member.timeout(
          minutes * 60 * 1000,
          reason
        );

        return interaction.reply(
          `🔇 ${user.tag} ha sido silenciado durante **${minutes} minutos**.`
        );
      }

      /* UNMUTE */

      if (interaction.commandName === "unmute") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("usuario");

        const member =
          interaction.guild.members.cache.get(
            user.id
          );

        if (!member) {
          return interaction.reply({
            content: "❌ Usuario no encontrado.",
            ephemeral: true
          });
        }

        await member.timeout(null);

        return interaction.reply(
          `🔊 Se quitó el silencio a ${user}.`
        );
      }

      /* PURGE */

      if (interaction.commandName === "purge") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const amount =
          interaction.options.getInteger("cantidad");

        await interaction.channel.bulkDelete(
          amount,
          true
        );

        return interaction.reply({
          content: `🧹 Se eliminaron ${amount} mensajes.`,
          ephemeral: true
        });
      }

      /* WARN */

      if (interaction.commandName === "warn") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("usuario");

        const reason =
          interaction.options.getString("razon");

        if (!data.warns[user.id]) {
          data.warns[user.id] = [];
        }

        data.warns[user.id].push({
          reason,
          moderator: interaction.user.id,
          date: Date.now()
        });

        saveDB();

        return interaction.reply(
          `⚠️ ${user} recibió una advertencia.\n**Razón:** ${reason}`
        );
      }

      /* WARNINGS */

      if (interaction.commandName === "warnings") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("usuario");

        const warnings =
          data.warns[user.id] || [];

        if (!warnings.length) {
          return interaction.reply(
            `✅ ${user} no tiene advertencias.`
          );
        }

        return interaction.reply({
          embeds: [
            yellowEmbed(
              `⚠️ Advertencias de ${user.tag}`,
              warnings
                .map(
                  (w, i) =>
                    `**${i + 1}.** ${w.reason}\n👮 <@${w.moderator}> • <t:${Math.floor(w.date / 1000)}:R>`
                )
                .join("\n\n")
            )
          ]
        });
      }

      /* SORTEO */

      if (interaction.commandName === "sorteo") {
        if (
          !interaction.member.permissions.has(
            PermissionFlagsBits.ManageGuild
          )
        ) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const durationText =
          interaction.options.getString("duracion");

        const duration =
          parseDuration(durationText);

        if (!duration) {
          return interaction.reply({
            content:
              "❌ Duración inválida. Usa `10m`, `1h`, `2d`, etc.",
            ephemeral: true
          });
        }

        const winners =
          interaction.options.getInteger("ganadores");

        const prize =
          interaction.options.getString("premio");

        const invites =
          interaction.options.getInteger("invitaciones") || 0;

        const level =
          interaction.options.getInteger("nivel") || 0;

        const fakeMessage = {
          guild: interaction.guild,
          channel: interaction.channel,
          author: interaction.user
        };

        await interaction.reply({
          content: "✅ Sorteo creado.",
          ephemeral: true
        });

        return createGiveaway(
          fakeMessage,
          duration,
          winners,
          prize,
          invites,
          level
        );
      }

      /* REROLL */

      if (interaction.commandName === "reroll") {
        if (
          !interaction.member.permissions.has(
            PermissionFlagsBits.ManageGuild
          )
        ) {
          return interaction.reply({
            content: "❌ No tienes permiso.",
            ephemeral: true
          });
        }

        const id =
          interaction.options.getString("id");

        const giveaway = data.giveaways[id];

        if (!giveaway) {
          return interaction.reply({
            content: "❌ Sorteo no encontrado.",
            ephemeral: true
          });
        }

        const members =
          giveaway.participants
            .map(id =>
              interaction.guild.members.cache.get(id)
            )
            .filter(Boolean);

        if (!members.length) {
          return interaction.reply({
            content: "❌ No hay participantes.",
            ephemeral: true
          });
        }

        const winner =
          members[
            Math.floor(Math.random() * members.length)
          ];

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "🔄・REROLL",
              `🎉 Nuevo ganador del sorteo **${id}**:\n\n🏆 ${winner}`
            )
          ]
        });
      }
    }

    /* =====================================================
       SELECT MENU
    ===================================================== */

    if (interaction.isStringSelectMenu()) {
      if (
        interaction.customId ===
        "ticket_category_select"
      ) {
        const data =
          guildDB(interaction.guild.id);

        const index = Number(
          interaction.values[0].replace(
            "ticket_category_",
            ""
          )
        );

        const category =
          data.ticketTypes[index];

        if (!category) {
          return interaction.reply({
            content:
              "❌ Esta categoría ya no existe.",
            ephemeral: true
          });
        }

        return showTicketModal(
          interaction,
          category,
          index
        );
      }
    }

    /* =====================================================
       MODAL TICKET
    ===================================================== */

    if (interaction.isModalSubmit()) {
      if (
        interaction.customId.startsWith(
          "ticket_modal_"
        )
      ) {
        const index = Number(
          interaction.customId.replace(
            "ticket_modal_",
            ""
          )
        );

        const data =
          guildDB(interaction.guild.id);

        const category =
          data.ticketTypes[index];

        if (!category) {
          return interaction.reply({
            content:
              "❌ Esta categoría ya no existe.",
            ephemeral: true
          });
        }

        const answers = category.questions
          .slice(0, 5)
          .map((question, i) => ({
            question,
            answer:
              interaction.fields.getTextInputValue(
                `question_${i}`
              )
          }));

        return createTicket(
          interaction,
          category,
          answers
        );
      }

      if (
        interaction.customId.startsWith(
          "ticket_close_modal_"
        )
      ) {
        const ticketId =
          interaction.customId.replace(
            "ticket_close_modal_",
            ""
          );

        const reason =
          interaction.fields.getTextInputValue(
            "close_reason"
          );

        return closeTicket(
          interaction,
          ticketId,
          reason
        );
      }
    }

    /* =====================================================
       BOTONES
    ===================================================== */

    if (interaction.isButton()) {
      const data =
        guildDB(interaction.guild.id);

      /* ADMIN TICKETS */

      if (interaction.customId === "admin_tickets") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "🎫・GESTIÓN DE TICKETS",
              `**Categorías:** ${data.ticketTypes.length}

${data.ticketTypes
  .map(
    category =>
      `🎫 **${category.name}**\n${category.questions
        .map(q => `> ${q}`)
        .join("\n")}`
  )
  .join("\n\n")}

📂 **Categoría Discord:** ${
                data.ticketCategory
                  ? `<#${data.ticketCategory}>`
                  : "No configurada"
              }

Usa:
\`/addcategory\`
\`/removecategory\`
\`/ticketpanel\`
\`/ticketcategory\``
            )
          ],
          ephemeral: true
        });
      }

      /* ADMIN MODERATION */

      if (
        interaction.customId ===
        "admin_moderation"
      ) {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "🛡️・MODERACIÓN",
              `El equipo autorizado puede utilizar:

🔨 \`/ban\`
👢 \`/kick\`
🔇 \`/mute\`
🔊 \`/unmute\`
🧹 \`/purge\`
⚠️ \`/warn\`
📋 \`/warnings\`

El rol Staff puede utilizar estas herramientas, pero no modificar la configuración del bot.`
            )
          ],
          ephemeral: true
        });
      }

      /* ADMIN LOGS */

      if (interaction.customId === "admin_logs") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "📜・LOGS",
              `📌 General: ${
                data.channels.generalLogs
                  ? `<#${data.channels.generalLogs}>`
                  : "No configurado"
              }

🛡️ Moderación: ${
                data.channels.moderationLogs
                  ? `<#${data.channels.moderationLogs}>`
                  : "No configurado"
              }

🎫 Tickets: ${
                data.channels.ticketLogs
                  ? `<#${data.channels.ticketLogs}>`
                  : "No configurado"
              }

💳 Transacciones: ${
                data.channels.transactionLogs
                  ? `<#${data.channels.transactionLogs}>`
                  : "No configurado"
              }

📈 Niveles: ${
                data.channels.levelLogs
                  ? `<#${data.channels.levelLogs}>`
                  : "No configurado"
              }`
            )
          ],
          ephemeral: true
        });
      }

      /* ADMIN WELCOME */

      if (interaction.customId === "admin_welcome") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "👋・WELCOME",
              `Canal actual:

${
                data.channels.welcome
                  ? `<#${data.channels.welcome}>`
                  : "❌ No configurado"
              }

Configura con:

\`/welcome #canal\`
\`n.welcome #canal\``
            )
          ],
          ephemeral: true
        });
      }

      /* ADMIN INVITES */

      if (interaction.customId === "admin_invites") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "🔗・INVITES",
              `📺 Canal:

${
                data.channels.invites
                  ? `<#${data.channels.invites}>`
                  : "❌ No configurado"
              }

Consulta invitaciones con:

\`/invitescheck @usuario\`
\`n.invitescheck @usuario\``
            )
          ],
          ephemeral: true
        });
      }

      /* ADMIN LEVELS */

      if (interaction.customId === "admin_levels") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "📈・NIVELES",
              `🟢 **Activo:** ${
                data.levels.enabled
                  ? "Sí"
                  : "No"
              }

📺 **Canal:** ${
                data.levels.channel
                  ? `<#${data.levels.channel}>`
                  : "Canal actual"
              }

✨ **XP:** ${data.levels.xpPerMessage}

⏱️ **Cooldown:** ${data.levels.cooldown}s

📝 **Mensaje:**
${data.levels.message}

Configura con:

\`/levels\``
            )
          ],
          ephemeral: true
        });
      }

      /* ADMIN AUTOROLES */

      if (
        interaction.customId ===
        "admin_autoroles"
      ) {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "👤・AUTOROLES",
              data.autoroles.length
                ? data.autoroles
                    .map(id => `• <@&${id}>`)
                    .join("\n")
                : "No hay autoroles configurados."
            )
          ],
          ephemeral: true
        });
      }

      /* ADMIN GIVEAWAYS */

      if (
        interaction.customId ===
        "admin_giveaways"
      ) {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const giveaways =
          Object.values(data.giveaways);

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "🎉・SORTEOS",
              giveaways.length
                ? giveaways
                    .map(
                      giveaway =>
                        `🎁 **${giveaway.prize}**\n🆔 \`${giveaway.id}\`\n👥 ${giveaway.participants.length} participantes\n${giveaway.ended ? "🔴 Finalizado" : "🟢 Activo"}`
                    )
                    .join("\n\n")
                : "No hay sorteos registrados.\n\nUsa `/sorteo` para crear uno."
            )
          ],
          ephemeral: true
        });
      }

      /* ADMIN CONFIG */

      if (interaction.customId === "admin_config") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "⚙️・CONFIGURACIÓN",
              `🛡️ **Staff:** ${
                data.staffRole
                  ? `<@&${data.staffRole}>`
                  : "No configurado"
              }

🎫 **Categoría de tickets:** ${
                data.ticketCategory
                  ? `<#${data.ticketCategory}>`
                  : "No configurada"
              }

👋 **Welcome:** ${
                data.channels.welcome
                  ? `<#${data.channels.welcome}>`
                  : "No configurado"
              }

🔗 **Invites:** ${
                data.channels.invites
                  ? `<#${data.channels.invites}>`
                  : "No configurado"
              }

🎫 **Categorías de tickets:** ${data.ticketTypes.length}

👤 **Autoroles:** ${data.autoroles.length}`
            )
          ],
          ephemeral: true
        });
      }

      /* ADMIN BUTTONS END */

      /* TICKET CLAIM */

      if (
        interaction.customId.startsWith(
          "ticket_claim_"
        )
      ) {
        const ticketId =
          interaction.customId.replace(
            "ticket_claim_",
            ""
          );

        const ticket =
          data.tickets[ticketId];

        if (!ticket) {
          return interaction.reply({
            content: "❌ Ticket no encontrado.",
            ephemeral: true
          });
        }

        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content:
              "❌ Solo el Staff puede reclamar tickets.",
            ephemeral: true
          });
        }

        ticket.claimedBy =
          interaction.user.id;

        saveDB();

        await interaction.reply({
          embeds: [
            yellowEmbed(
              "👤 Ticket reclamado",
              `${interaction.user} se ha hecho cargo de este ticket.`
            )
          ]
        });

        return sendLog(
          interaction.guild,
          "ticketLogs",
          yellowEmbed(
            "👤 Ticket reclamado",
            `**Ticket:** \`${ticketId}\`\n**Staff:** ${interaction.user}`
          )
        );
      }

      /* NOTIFY STAFF */

      if (
        interaction.customId.startsWith(
          "ticket_notify_"
        )
      ) {
        const ticketId =
          interaction.customId.replace(
            "ticket_notify_",
            ""
          );

        const ticket =
          data.tickets[ticketId];

        if (!ticket) {
          return interaction.reply({
            content: "❌ Ticket no encontrado.",
            ephemeral: true
          });
        }

        if (data.staffRole) {
          await interaction.channel.send(
            `🔔 <@&${data.staffRole}> **${interaction.user} solicita atención en este ticket.**`
          );
        }

        return interaction.reply({
          content:
            "🔔 El staff ha sido notificado.",
          ephemeral: true
        });
      }

      /* CLOSE */

      if (
        interaction.customId.startsWith(
          "ticket_close_"
        )
      ) {
        const ticketId =
          interaction.customId.replace(
            "ticket_close_",
            ""
          );

        const ticket =
          data.tickets[ticketId];

        if (!ticket) {
          return interaction.reply({
            content: "❌ Ticket no encontrado.",
            ephemeral: true
          });
        }

        if (
          interaction.user.id !== ticket.userId &&
          !isStaff(interaction.member)
        ) {
          return interaction.reply({
            content:
              "❌ No tienes permiso para cerrar este ticket.",
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(
            `ticket_close_modal_${ticketId}`
          )
          .setTitle("🔒 Cerrar ticket");

        const reasonInput =
          new TextInputBuilder()
            .setCustomId("close_reason")
            .setLabel("Motivo del cierre")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(
              "Explica brevemente por qué se cierra..."
            )
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            reasonInput
          )
        );

        return interaction.showModal(modal);
      }

      /* RATING */

      if (
        interaction.customId.startsWith(
          "ticket_rating_"
        )
      ) {
        const parts =
          interaction.customId.split("_");

        const ticketId = parts[2];
        const rating = Number(parts[3]);

        return rateTicket(
          interaction,
          ticketId,
          rating
        );
      }

      /* GIVEAWAY JOIN */

      if (
        interaction.customId.startsWith(
          "giveaway_join_"
        )
      ) {
        const giveawayId =
          interaction.customId.replace(
            "giveaway_join_",
            ""
          );

        const giveaway =
          data.giveaways[giveawayId];

        if (!giveaway) {
          return interaction.reply({
            content: "❌ Sorteo no encontrado.",
            ephemeral: true
          });
        }

        if (giveaway.ended) {
          return interaction.reply({
            content: "❌ Este sorteo ya terminó.",
            ephemeral: true
          });
        }

        if (
          giveaway.participants.includes(
            interaction.user.id
          )
        ) {
          return interaction.reply({
            content:
              "❌ Ya estás participando en este sorteo.",
            ephemeral: true
          });
        }

        const levelData =
          getLevelData(
            interaction.guild,
            interaction.user.id
          );

        const inviteData =
          data.invites.users[
            interaction.user.id
          ] || {
            total: 0
          };

        if (
          inviteData.total <
          giveaway.inviteRequirement
        ) {
          return interaction.reply({
            content: `❌ Necesitas al menos **${giveaway.inviteRequirement} invitaciones**.`,
            ephemeral: true
          });
        }

        if (
          levelData.level <
          giveaway.levelRequirement
        ) {
          return interaction.reply({
            content: `❌ Necesitas ser nivel **${giveaway.levelRequirement}**.`,
            ephemeral: true
          });
        }

        giveaway.participants.push(
          interaction.user.id
        );

        saveDB();

        return interaction.reply({
          content:
            "🎉 ¡Has entrado correctamente al sorteo!",
          ephemeral: true
        });
      }
    }
  } catch (error) {
    console.error("❌ Error en interactionCreate:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          "❌ Ocurrió un error al procesar esta acción.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* =========================================================
   LOGS DE MENSAJES
========================================================= */

client.on("messageDelete", async message => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    "generalLogs",
    yellowEmbed(
      "🗑️ Mensaje eliminado",
      `👤 **Autor:** ${
        message.author || "Desconocido"
      }

📺 **Canal:** ${message.channel}

💬 **Contenido:**
${message.content || "Sin contenido de texto"}`
    )
  );
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!oldMessage.guild) return;
  if (oldMessage.author?.bot) return;

  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    oldMessage.guild,
    "generalLogs",
    yellowEmbed(
      "✏️ Mensaje editado",
      `👤 **Autor:** ${oldMessage.author}

📺 **Canal:** ${oldMessage.channel}

**Antes:**
${oldMessage.content || "Sin contenido"}

**Después:**
${newMessage.content || "Sin contenido"}`
    )
  );
});

/* =========================================================
   INVITE CACHE
========================================================= */

client.on("inviteCreate", async invite => {
  await cacheGuildInvites(invite.guild);
});

client.on("inviteDelete", async invite => {
  await cacheGuildInvites(invite.guild);
});

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN);
