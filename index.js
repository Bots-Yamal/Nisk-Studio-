const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ======================================================
// CONFIGURACIÓN GENERAL
// ======================================================

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = "n.";
const COLOR = 0xFFD54A;
const DATA_FILE = path.join(__dirname, "data.json");

if (!TOKEN) {
  console.error("❌ Falta la variable de entorno DISCORD_TOKEN.");
  process.exit(1);
}

// ======================================================
// CLIENTE
// ======================================================

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
    Partials.Message,
    Partials.User,
    Partials.GuildMember
  ]
});

// ======================================================
// BASE DE DATOS JSON
// ======================================================

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
    const temp = DATA_FILE + ".tmp";

    fs.writeFileSync(temp, JSON.stringify(db, null, 2));
    fs.renameSync(temp, DATA_FILE);
  } catch (error) {
    console.error("Error guardando data.json:", error);
  }
}

function guildDB(guildId) {
  if (!db[guildId]) {
    db[guildId] = {
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

      ticketTypes: {
        soporte: {
          name: "Soporte",
          question: "¿En qué podemos ayudarte?"
        }
      },

      autoroles: [],

      warns: {},

      tickets: {},

      invites: {
        users: {}
      },

      levels: {},

      settings: {
        levels: true
      }
    };

    saveDB();
  }

  return db[guildId];
}

loadDB();

// ======================================================
// FUNCIONES
// ======================================================

function yellowEmbed(title, description = "") {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function isRealAdmin(member) {
  return (
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

function isStaff(member) {
  const data = guildDB(member.guild.id);

  if (isRealAdmin(member)) return true;

  if (data.staffRole && member.roles.cache.has(data.staffRole)) {
    return true;
  }

  return false;
}

async function sendLog(guild, type, embed) {
  const data = guildDB(guild.id);

  let channelId = null;

  if (type === "moderation") {
    channelId =
      data.channels.moderationLogs ||
      data.channels.generalLogs;
  }

  if (type === "ticket") {
    channelId =
      data.channels.ticketLogs ||
      data.channels.generalLogs;
  }

  if (type === "transaction") {
    channelId =
      data.channels.transactionLogs ||
      data.channels.generalLogs;
  }

  if (type === "level") {
    channelId =
      data.channels.levelLogs ||
      data.channels.generalLogs;
  }

  if (type === "general") {
    channelId = data.channels.generalLogs;
  }

  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);

  if (!channel?.isTextBased()) return;

  try {
    await channel.send({ embeds: [embed] });
  } catch {}
}

function cleanName(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50);
}

function ticketRecordByChannel(guildId, channelId) {
  const data = guildDB(guildId);

  return Object.values(data.tickets).find(
    t => t.channelId === channelId && !t.closed
  );
}

function getLevelData(guildId, userId) {
  const data = guildDB(guildId);

  if (!data.levels[userId]) {
    data.levels[userId] = {
      xp: 0,
      level: 0,
      lastXP: 0
    };
  }

  return data.levels[userId];
}

function xpNeeded(level) {
  return 100 + level * 75;
}

// ======================================================
// INVITES CACHE
// ======================================================

const inviteCache = new Map();

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();

    inviteCache.set(
      guild.id,
      new Map(
        invites.map(invite => [
          invite.code,
          invite.uses || 0
        ])
      )
    );
  } catch {
    inviteCache.set(guild.id, new Map());
  }
}

// ======================================================
// SLASH COMMANDS
// ======================================================

const commands = [

  new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Configura el rol de staff.")
    .addRoleOption(option =>
      option
        .setName("rol")
        .setDescription("Rol del staff")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addcategory")
    .setDescription("Añade una categoría al panel de tickets.")
    .addStringOption(option =>
      option
        .setName("nombre")
        .setDescription("Nombre de la categoría")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("pregunta")
        .setDescription("Pregunta que verá el usuario")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("removecategory")
    .setDescription("Elimina una categoría de tickets.")
    .addStringOption(option =>
      option
        .setName("nombre")
        .setDescription("Categoría")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription("Envía el panel de tickets."),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configura el canal de bienvenida.")
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Configura el canal de invitaciones.")
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("invitescheck")
    .setDescription("Comprueba las invitaciones de un usuario.")
    .addUserOption(option =>
      option
        .setName("usuario")
        .setDescription("Usuario")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Configura un autorol.")
    .addRoleOption(option =>
      option
        .setName("rol")
        .setDescription("Rol")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configura los canales de logs.")
    .addStringOption(option =>
      option
        .setName("tipo")
        .setDescription("Tipo de logs")
        .setRequired(true)
        .addChoices(
          { name: "Generales", value: "generalLogs" },
          { name: "Moderación", value: "moderationLogs" },
          { name: "Tickets", value: "ticketLogs" },
          { name: "Transacciones", value: "transactionLogs" },
          { name: "Niveles", value: "levelLogs" }
        )
    )
    .addChannelOption(option =>
      option
        .setName("canal")
        .setDescription("Canal")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banea a un usuario.")
    .addUserOption(option =>
      option.setName("usuario").setDescription("Usuario").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("razon").setDescription("Razón")
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa a un usuario.")
    .addUserOption(option =>
      option.setName("usuario").setDescription("Usuario").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("razon").setDescription("Razón")
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Silencia temporalmente a un usuario.")
    .addUserOption(option =>
      option.setName("usuario").setDescription("Usuario").setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutos")
        .setDescription("Minutos")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("razon").setDescription("Razón")
    ),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Quita el timeout.")
    .addUserOption(option =>
      option.setName("usuario").setDescription("Usuario").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Elimina mensajes.")
    .addIntegerOption(option =>
      option
        .setName("cantidad")
        .setDescription("Cantidad")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Advierte a un usuario.")
    .addUserOption(option =>
      option.setName("usuario").setDescription("Usuario").setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("razon")
        .setDescription("Razón")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Muestra las advertencias.")
    .addUserOption(option =>
      option.setName("usuario").setDescription("Usuario").setRequired(true)
    )

].map(command => command.toJSON());

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {
  console.log(`💛 Nisk Studio conectado como ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: "Nisk Studio | Programación"
      }
    ],
    status: "online"
  });

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("✅ Slash commands registrados.");
  } catch (error) {
    console.error("Error registrando comandos:", error);
  }

  for (const guild of client.guilds.cache.values()) {
    guildDB(guild.id);
    await cacheGuildInvites(guild);
  }
});

// ======================================================
// NUEVO SERVIDOR
// ======================================================

client.on("guildCreate", async guild => {
  guildDB(guild.id);
  await cacheGuildInvites(guild);
});

// ======================================================
// INVITES
// ======================================================

client.on("inviteCreate", async invite => {
  if (invite.guild) {
    await cacheGuildInvites(invite.guild);
  }
});

client.on("inviteDelete", async invite => {
  if (invite.guild) {
    await cacheGuildInvites(invite.guild);
  }
});

// ======================================================
// MEMBER JOIN
// ======================================================

client.on("guildMemberAdd", async member => {
  const data = guildDB(member.guild.id);

  // AUTOROLES

  for (const roleId of data.autoroles) {
    const role = member.guild.roles.cache.get(roleId);

    if (!role) continue;

    try {
      await member.roles.add(role);
    } catch {}
  }

  // WELCOME

  if (data.channels.welcome) {
    const channel = member.guild.channels.cache.get(
      data.channels.welcome
    );

    if (channel?.isTextBased()) {
      const welcomeEmbed = new EmbedBuilder()
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
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      await channel.send({
        content: `${member}`,
        embeds: [welcomeEmbed]
      }).catch(() => {});
    }
  }

  // DETECTAR INVITE

  try {
    const oldInvites =
      inviteCache.get(member.guild.id) || new Map();

    const newInvites =
      await member.guild.invites.fetch();

    let usedInvite = null;

    for (const invite of newInvites.values()) {
      const previousUses =
        oldInvites.get(invite.code) || 0;

      if ((invite.uses || 0) > previousUses) {
        usedInvite = invite;
        break;
      }
    }

    inviteCache.set(
      member.guild.id,
      new Map(
        newInvites.map(invite => [
          invite.code,
          invite.uses || 0
        ])
      )
    );

    if (usedInvite?.inviter) {
      const inviter = usedInvite.inviter;

      if (!data.invites.users[inviter.id]) {
        data.invites.users[inviter.id] = {
          total: 0,
          active: [],
          left: []
        };
      }

      const stats =
        data.invites.users[inviter.id];

      if (!stats.active.includes(member.id)) {
        stats.total += 1;
        stats.active.push(member.id);
      }

      saveDB();

      if (data.channels.invites) {
        const channel =
          member.guild.channels.cache.get(
            data.channels.invites
          );

        if (channel?.isTextBased()) {
          const inviteEmbed = new EmbedBuilder()
            .setColor(COLOR)
            .setTitle("💛・¡Nueva invitación!")
            .setDescription(
`👤・${member} se ha unido a Nisk Studio.
🔗・Invitado por: ${inviter}
✨・${inviter} ahora tiene ${stats.total} invitaciones.
👥・Ya somos ${member.guild.memberCount} miembros.

Gracias por ayudar a crecer la comunidad. 💛`
            )
            .setTimestamp();

          await channel.send({
            embeds: [inviteEmbed]
          }).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.error("Error detectando invite:", error);
  }

  await sendLog(
    member.guild,
    "general",
    yellowEmbed(
      "📥 Miembro entró",
      `${member} (${member.user.tag})\nID: \`${member.id}\``
    )
  );
});

// ======================================================
// MEMBER LEAVE
// ======================================================

client.on("guildMemberRemove", async member => {
  const data = guildDB(member.guild.id);

  for (const stats of Object.values(data.invites.users)) {
    const index = stats.active.indexOf(member.id);

    if (index !== -1) {
      stats.active.splice(index, 1);

      if (!stats.left.includes(member.id)) {
        stats.left.push(member.id);
      }

      saveDB();
      break;
    }
  }

  await sendLog(
    member.guild,
    "general",
    yellowEmbed(
      "📤 Miembro salió",
      `${member.user.tag}\nID: \`${member.id}\``
    )
  );
});

// ======================================================
// MENSAJES + PREFIX + LEVELS
// ======================================================

client.on("messageCreate", async message => {
  if (!message.guild) return;
  if (message.author.bot) return;

  const data = guildDB(message.guild.id);

  // XP

  if (data.settings.levels) {
    const levelData =
      getLevelData(message.guild.id, message.author.id);

    const now = Date.now();

    if (now - levelData.lastXP >= 60000) {
      levelData.lastXP = now;
      levelData.xp += Math.floor(Math.random() * 8) + 8;

      const needed =
        xpNeeded(levelData.level);

      if (levelData.xp >= needed) {
        levelData.xp -= needed;
        levelData.level += 1;

        await message.channel.send({
          embeds: [
            yellowEmbed(
              "✨ ¡Subiste de nivel!",
              `${message.author} ahora eres nivel **${levelData.level}**.`
            )
          ]
        }).catch(() => {});

        await sendLog(
          message.guild,
          "level",
          yellowEmbed(
            "✨ Nivel",
            `${message.author} llegó al nivel **${levelData.level}**.`
          )
        );
      }

      saveDB();
    }
  }

  if (!message.content.toLowerCase().startsWith(PREFIX)) {
    return;
  }

  const raw =
    message.content.slice(PREFIX.length).trim();

  const args = raw.split(/\s+/);

  const command =
    (args.shift() || "").toLowerCase();

  // ====================================================
  // N.ADMIN
  // ====================================================

  if (command === "admin") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores pueden abrir este panel.");
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle("💛 Nisk Studio | Administración")
      .setDescription(
`Panel principal de configuración.

🎫 **Tickets**
Configura categorías y paneles.

📋 **Logs**
Configura los registros del servidor.

👋 **Bienvenidas**
Configura las entradas.

🔗 **Invitaciones**
Sistema de invites.

🛡️ **Moderación**
Herramientas del staff.

🎭 **Autoroles**
Roles automáticos.

✨ **Niveles**
Sistema de experiencia.`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("admin_tickets")
        .setLabel("Tickets")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("admin_logs")
        .setLabel("Logs")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("admin_info")
        .setLabel("Configuración")
        .setEmoji("⚙️")
        .setStyle(ButtonStyle.Secondary)
    );

    return message.channel.send({
      embeds: [embed],
      components: [row]
    });
  }

  // ====================================================
  // TICKETPANEL
  // ====================================================

  if (command === "ticketpanel") {
    if (!isRealAdmin(message.member)) {
      return message.reply("❌ Solo administradores.");
    }

    return sendTicketPanel(message.channel, message.guild);
  }

  // ====================================================
  // INVITECHECK
  // ====================================================

  if (
    command === "invitescheck" ||
    command === "invitecheck"
  ) {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permisos.");
    }

    const user =
      message.mentions.users.first();

    if (!user) {
      return message.reply(
        "Uso: `n.invitescheck @usuario`"
      );
    }

    return sendInviteStats(
      message,
      user
    );
  }

  // ====================================================
  // EMBED
  // n.embed #FFD700 mensaje
  // Puede adjuntar imagen
  // ====================================================

  if (command === "embed") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permisos.");
    }

    const colorText = args.shift();

    if (!colorText || args.length === 0) {
      return message.reply(
        "Uso: `n.embed #FFD700 Tu mensaje`"
      );
    }

    let color = colorText.replace("#", "");

    if (!/^[0-9A-Fa-f]{6}$/.test(color)) {
      return message.reply(
        "❌ Usa un color HEX válido. Ejemplo: `#FFD700`"
      );
    }

    const description = args.join(" ");

    const embed = new EmbedBuilder()
      .setColor(parseInt(color, 16))
      .setDescription(description);

    const attachment =
      message.attachments.first();

    if (attachment) {
      embed.setImage(attachment.url);
    }

    return message.channel.send({
      embeds: [embed]
    });
  }

  // ====================================================
  // PAY
  // ====================================================

  if (command === "pay") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permisos.");
    }

    const user =
      message.mentions.users.first();

    if (!user) {
      return message.reply(
        "Uso: `n.pay @usuario cantidad concepto`"
      );
    }

    const withoutMention =
      args.filter(a => !a.startsWith("<@"));

    const amount =
      withoutMention.shift();

    const concept =
      withoutMention.join(" ") || "Sin especificar";

    if (!amount) {
      return message.reply(
        "❌ Indica la cantidad."
      );
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle("💳 Transacción registrada")
      .addFields(
        {
          name: "👤 Usuario",
          value: `${user}`,
          inline: true
        },
        {
          name: "💰 Cantidad",
          value: `${amount}`,
          inline: true
        },
        {
          name: "📝 Concepto",
          value: concept
        },
        {
          name: "🛡️ Registrado por",
          value: `${message.author}`
        }
      )
      .setTimestamp();

    await message.channel.send({
      embeds: [embed]
    });

    await sendLog(
      message.guild,
      "transaction",
      embed
    );

    return;
  }

  // ====================================================
  // RANK
  // ====================================================

  if (command === "rank") {
    const user =
      message.mentions.users.first() ||
      message.author;

    const level =
      getLevelData(message.guild.id, user.id);

    return message.reply({
      embeds: [
        yellowEmbed(
          `✨ Nivel de ${user.username}`,
          `Nivel: **${level.level}**\nXP: **${level.xp}/${xpNeeded(level.level)}**`
        )
      ]
    });
  }

  // ====================================================
  // PREFIX MODERATION
  // ====================================================

  if (command === "purge") {
    if (!isStaff(message.member)) {
      return message.reply("❌ No tienes permisos.");
    }

    const amount =
      Number(args[0]);

    if (!amount || amount < 1 || amount > 100) {
      return message.reply(
        "Uso: `n.purge 1-100`"
      );
    }

    const deleted =
      await message.channel.bulkDelete(
        amount,
        true
      ).catch(() => null);

    if (!deleted) {
      return message.reply(
        "❌ No pude eliminar los mensajes."
      );
    }

    await sendLog(
      message.guild,
      "moderation",
      yellowEmbed(
        "🧹 Purge",
        `${message.author} eliminó **${deleted.size}** mensajes en ${message.channel}.`
      )
    );
  }
});

// ======================================================
// TICKET PANEL
// ======================================================

async function sendTicketPanel(channel, guild) {
  const data = guildDB(guild.id);

  const entries =
    Object.entries(data.ticketTypes);

  if (!entries.length) {
    return channel.send(
      "❌ No existen categorías de tickets."
    );
  }

  const options =
    entries.slice(0, 25).map(([key, category]) => ({
      label: category.name.substring(0, 100),
      description:
        category.question.substring(0, 100),
      value: key,
      emoji: "💛"
    }));

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("💛 Nisk Studio | Soporte")
    .setDescription(
`¿Necesitas ayuda con algún servicio o tienes alguna consulta?

Selecciona la categoría correspondiente en el menú inferior.

Nuestro equipo atenderá tu solicitud lo antes posible.

⚠️ No abras tickets sin motivo.`
    )
    .setFooter({
      text: "Nisk Studio | Programación"
    });

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .setPlaceholder("Selecciona una categoría")
      .addOptions(options);

  const row =
    new ActionRowBuilder()
      .addComponents(menu);

  return channel.send({
    embeds: [embed],
    components: [row]
  });
}

// ======================================================
// INVITE STATS
// ======================================================

async function sendInviteStats(source, user) {
  const guild =
    source.guild;

  const data =
    guildDB(guild.id);

  const stats =
    data.invites.users[user.id] || {
      total: 0,
      active: [],
      left: []
    };

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`💛 Invitaciones de ${user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      {
        name: "👥 Miembros invitados",
        value: `**${stats.total}**`
      },
      {
        name: "✅ Actualmente en el servidor",
        value: `**${stats.active.length}**`
      },
      {
        name: "🚪 Invitados que se fueron",
        value: `**${stats.left.length}**`
      },
      {
        name: "✨ Total",
        value: `**${stats.total}**`
      }
    )
    .setTimestamp();

  if (source.reply) {
    return source.reply({
      embeds: [embed]
    });
  }
}

// ======================================================
// INTERACTIONS
// ======================================================

client.on("interactionCreate", async interaction => {
  try {

    // ==================================================
    // SLASH COMMANDS
    // ==================================================

    if (interaction.isChatInputCommand()) {
      const data =
        guildDB(interaction.guild.id);

      // ADMIN ROLE

      if (interaction.commandName === "admin") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content:
              "❌ Solo administradores reales pueden configurar el staff.",
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
              `${role} ahora puede utilizar las herramientas de soporte y moderación.\n\nNo obtiene acceso a la configuración administrativa del bot.`
            )
          ]
        });
      }

      // ADD CATEGORY

      if (interaction.commandName === "addcategory") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const name =
          interaction.options.getString("nombre");

        const question =
          interaction.options.getString("pregunta");

        const key =
          cleanName(name);

        data.ticketTypes[key] = {
          name,
          question
        };

        saveDB();

        return interaction.reply({
          embeds: [
            yellowEmbed(
              "💛 Categoría añadida",
              `**${name}**\n\nPregunta:\n${question}`
            )
          ]
        });
      }

      // REMOVE CATEGORY

      if (interaction.commandName === "removecategory") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const name =
          interaction.options.getString("nombre");

        const key =
          cleanName(name);

        if (!data.ticketTypes[key]) {
          return interaction.reply({
            content:
              "❌ Esa categoría no existe.",
            ephemeral: true
          });
        }

        delete data.ticketTypes[key];

        saveDB();

        return interaction.reply({
          content:
            `✅ Categoría **${name}** eliminada.`
        });
      }

      // TICKET PANEL

      if (interaction.commandName === "ticketpanel") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        await interaction.reply({
          content:
            "✅ Panel enviado.",
          ephemeral: true
        });

        return sendTicketPanel(
          interaction.channel,
          interaction.guild
        );
      }

      // WELCOME

      if (interaction.commandName === "welcome") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const channel =
          interaction.options.getChannel("canal");

        if (!channel.isTextBased()) {
          return interaction.reply({
            content: "❌ Debe ser un canal de texto.",
            ephemeral: true
          });
        }

        data.channels.welcome =
          channel.id;

        saveDB();

        return interaction.reply({
          content:
            `✅ Bienvenidas configuradas en ${channel}.`
        });
      }

      // INVITE CHANNEL

      if (interaction.commandName === "invite") {
        if (!isRealAdmin(interaction.member)) {
          return interaction.reply({
            content: "❌ Solo administradores.",
            ephemeral: true
          });
        }

        const channel =
          interaction.options.getChannel("canal");

        if (!channel.isTextBased()) {
          return interaction.reply({
            content: "❌ Debe ser un canal de texto.",
            ephemeral: true
          });
        }

        data.channels.invites =
          channel.id;

        saveDB();

        return interaction.reply({
          content:
            `✅ Invitaciones configuradas en ${channel}.`
        });
      }

      // INVITESCHECK

      if (interaction.commandName === "invitescheck") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permisos.",
            ephemeral: true
          });
        }

        const user =
          interaction.options.getUser("usuario");

        const stats =
          data.invites.users[user.id] || {
            total: 0,
            active: [],
            left: []
          };

        const embed =
          new EmbedBuilder()
            .setColor(COLOR)
            .setTitle(
              `💛 Invitaciones de ${user.username}`
            )
            .setThumbnail(
              user.displayAvatarURL()
            )
            .addFields(
              {
                name: "👥 Miembros invitados",
                value: `**${stats.total}**`
              },
              {
                name: "✅ Actualmente en el servidor",
                value: `**${stats.active.length}**`
              },
              {
                name: "🚪 Invitados que se fueron",
                value: `**${stats.left.length}**`
              },
              {
                name: "✨ Total",
                value: `**${stats.total}**`
              }
            );

        return interaction.reply({
          embeds: [embed]
        });
      }

      // AUTOROLE

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

        return interaction.reply({
          content:
            `✅ ${role} añadido como autorol.`
        });
      }

      // LOGS

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

        if (!channel.isTextBased()) {
          return interaction.reply({
            content: "❌ Debe ser un canal de texto.",
            ephemeral: true
          });
        }

        data.channels[type] =
          channel.id;

        saveDB();

        return interaction.reply({
          content:
            `✅ Logs configurados en ${channel}.`
        });
      }

      // ==================================================
      // MODERATION
      // ==================================================

      if (
        [
          "ban",
          "kick",
          "mute",
          "unmute",
          "purge",
          "warn",
          "warnings"
        ].includes(interaction.commandName)
      ) {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ No tienes permisos.",
            ephemeral: true
          });
        }
      }

      // BAN

      if (interaction.commandName === "ban") {
        const user =
          interaction.options.getUser("usuario");

        const reason =
          interaction.options.getString("razon") ||
          "Sin especificar";

        const member =
          await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        if (member && !member.bannable) {
          return interaction.reply({
            content:
              "❌ No puedo banear a ese miembro. Revisa la jerarquía de roles.",
            ephemeral: true
          });
        }

        await interaction.guild.members.ban(
          user.id,
          {
            reason:
              `${reason} | ${interaction.user.tag}`
          }
        );

        await interaction.reply({
          embeds: [
            yellowEmbed(
              "🔨 Usuario baneado",
              `${user}\n\n**Razón:** ${reason}`
            )
          ]
        });

        return sendLog(
          interaction.guild,
          "moderation",
          yellowEmbed(
            "🔨 Ban",
            `Usuario: ${user}\nModerador: ${interaction.user}\nRazón: ${reason}`
          )
        );
      }

      // KICK

      if (interaction.commandName === "kick") {
        const user =
          interaction.options.getUser("usuario");

        const reason =
          interaction.options.getString("razon") ||
          "Sin especificar";

        const member =
          await interaction.guild.members.fetch(
            user.id
          ).catch(() => null);

        if (!member) {
          return interaction.reply({
            content:
              "❌ Ese usuario no está en el servidor.",
            ephemeral: true
          });
        }

        if (!member.kickable) {
          return interaction.reply({
            content:
              "❌ No puedo expulsar a ese miembro.",
            ephemeral: true
          });
        }

        await member.kick(reason);

        await interaction.reply({
          embeds: [
            yellowEmbed(
              "👢 Usuario expulsado",
              `${user}\n\n**Razón:** ${reason}`
            )
          ]
        });

        return sendLog(
          interaction.guild,
          "moderation",
          yellowEmbed(
            "👢 Kick",
            `Usuario: ${user}\nModerador: ${interaction.user}\nRazón: ${reason}`
          )
        );
      }

      // MUTE

      if (interaction.commandName === "mute") {
        const user =
          interaction.options.getUser("usuario");

        const minutes =
          interaction.options.getInteger("minutos");

        const reason =
          interaction.options.getString("razon") ||
          "Sin especificar";

        const member =
          await interaction.guild.members.fetch(
            user.id
          ).catch(() => null);

        if (!member || !member.moderatable) {
          return interaction.reply({
            content:
              "❌ No puedo aplicar timeout a ese miembro.",
            ephemeral: true
          });
        }

        await member.timeout(
          minutes * 60 * 1000,
          reason
        );

        await interaction.reply({
          embeds: [
            yellowEmbed(
              "🔇 Usuario silenciado",
              `${user}\n⏱️ **${minutes} minutos**\n📝 ${reason}`
            )
          ]
        });

        return sendLog(
          interaction.guild,
          "moderation",
          yellowEmbed(
            "🔇 Timeout",
            `Usuario: ${user}\nModerador: ${interaction.user}\nDuración: ${minutes} minutos\nRazón: ${reason}`
          )
        );
      }

      // UNMUTE

      if (interaction.commandName === "unmute") {
        const user =
          interaction.options.getUser("usuario");

        const member =
          await interaction.guild.members.fetch(
            user.id
          ).catch(() => null);

        if (!member || !member.moderatable) {
          return interaction.reply({
            content:
              "❌ No puedo modificar a ese miembro.",
            ephemeral: true
          });
        }

        await member.timeout(null);

        await interaction.reply({
          content:
            `🔊 Se retiró el timeout de ${user}.`
        });

        return sendLog(
          interaction.guild,
          "moderation",
          yellowEmbed(
            "🔊 Timeout retirado",
            `${interaction.user} retiró el timeout de ${user}.`
          )
        );
      }

      // PURGE

      if (interaction.commandName === "purge") {
        const amount =
          interaction.options.getInteger("cantidad");

        const deleted =
          await interaction.channel.bulkDelete(
            amount,
            true
          );

        await interaction.reply({
          content:
            `🧹 Se eliminaron **${deleted.size}** mensajes.`,
          ephemeral: true
        });

        return sendLog(
          interaction.guild,
          "moderation",
          yellowEmbed(
            "🧹 Purge",
            `${interaction.user} eliminó **${deleted.size}** mensajes en ${interaction.channel}.`
          )
        );
      }

      // WARN

      if (interaction.commandName === "warn") {
        const user =
          interaction.options.getUser("usuario");

        const reason =
          interaction.options.getString("razon");

        if (!data.warns[user.id]) {
          data.warns[user.id] = [];
        }

        data.warns[user.id].push({
          reason,
          moderator:
            interaction.user.id,
          date:
            new Date().toISOString()
        });

        saveDB();

        await interaction.reply({
          embeds: [
            yellowEmbed(
              "⚠️ Advertencia",
              `${user} recibió una advertencia.\n\n**Razón:** ${reason}`
            )
          ]
        });

        return sendLog(
          interaction.guild,
          "moderation",
          yellowEmbed(
            "⚠️ Warn",
            `Usuario: ${user}\nModerador: ${interaction.user}\nRazón: ${reason}`
          )
        );
      }

      // WARNINGS

      if (interaction.commandName === "warnings") {
        const user =
          interaction.options.getUser("usuario");

        const warns =
          data.warns[user.id] || [];

        if (!warns.length) {
          return interaction.reply({
            content:
              `✅ ${user} no tiene advertencias.`
          });
        }

        const text =
          warns.slice(-10).map(
            (warn, index) =>
              `**${index + 1}.** ${warn.reason}\nModerador: <@${warn.moderator}>`
          ).join("\n\n");

        return interaction.reply({
          embeds: [
            yellowEmbed(
              `⚠️ Advertencias de ${user.username}`,
              text
            )
          ]
        });
      }
    }

    // ==================================================
    // TICKET SELECT
    // ==================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "ticket_select"
    ) {
      const data =
        guildDB(interaction.guild.id);

      const type =
        interaction.values[0];

      const category =
        data.ticketTypes[type];

      if (!category) {
        return interaction.reply({
          content:
            "❌ Esa categoría ya no existe.",
          ephemeral: true
        });
      }

      const existing =
        Object.values(data.tickets).find(
          ticket =>
            ticket.userId === interaction.user.id &&
            !ticket.closed
        );

      if (existing) {
        const channel =
          interaction.guild.channels.cache.get(
            existing.channelId
          );

        if (channel) {
          return interaction.reply({
            content:
              `❌ Ya tienes un ticket abierto: ${channel}`,
            ephemeral: true
          });
        }
      }

      await interaction.deferReply({
        ephemeral: true
      });

      const overwrites = [
        {
          id:
            interaction.guild.roles.everyone.id,
          deny: [
            PermissionFlagsBits.ViewChannel
          ]
        },
        {
          id:
            interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        },
        {
          id:
            client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory
          ]
        }
      ];

      if (data.staffRole) {
        overwrites.push({
          id:
            data.staffRole,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        });
      }

      const channel =
        await interaction.guild.channels.create({
          name:
            `ticket-${cleanName(interaction.user.username)}`,
          type:
            ChannelType.GuildText,
          parent:
            data.ticketCategory || undefined,
          permissionOverwrites:
            overwrites
        });

      data.tickets[channel.id] = {
        channelId:
          channel.id,
        userId:
          interaction.user.id,
        type,
        claimedBy:
          null,
        closed:
          false,
        createdAt:
          Date.now()
      };

      saveDB();

      const embed =
        new EmbedBuilder()
          .setColor(COLOR)
          .setTitle(
            `💛 ${category.name}`
          )
          .setDescription(
`Hola ${interaction.user} 👋

Gracias por contactar con **Nisk Studio**.

**Pregunta:**
${category.question}

Explica tu solicitud con todos los detalles posibles.

Un miembro del equipo te atenderá pronto.`
          )
          .setFooter({
            text:
              "Nisk Studio | Programación"
          });

      const buttons =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("ticket_claim")
              .setLabel("Reclamar")
              .setEmoji("🙋")
              .setStyle(
                ButtonStyle.Primary
              ),

            new ButtonBuilder()
              .setCustomId("ticket_close")
              .setLabel("Cerrar")
              .setEmoji("🔒")
              .setStyle(
                ButtonStyle.Danger
              )
          );

      await channel.send({
        content:
          `${interaction.user}` +
          (data.staffRole
            ? ` <@&${data.staffRole}>`
            : ""),
        embeds: [embed],
        components: [buttons]
      });

      await interaction.editReply({
        content:
          `✅ Tu ticket fue creado: ${channel}`
      });

      return sendLog(
        interaction.guild,
        "ticket",
        yellowEmbed(
          "🎫 Ticket creado",
          `Usuario: ${interaction.user}\nCategoría: **${category.name}**\nCanal: ${channel}`
        )
      );
    }

    // ==================================================
    // CLAIM
    // ==================================================

    if (
      interaction.isButton() &&
      interaction.customId === "ticket_claim"
    ) {
      if (!isStaff(interaction.member)) {
        return interaction.reply({
          content:
            "❌ Solo el staff puede reclamar tickets.",
          ephemeral: true
        });
      }

      const ticket =
        ticketRecordByChannel(
          interaction.guild.id,
          interaction.channel.id
        );

      if (!ticket) {
        return interaction.reply({
          content:
            "❌ Este ticket no está registrado.",
          ephemeral: true
        });
      }

      if (ticket.claimedBy) {
        return interaction.reply({
          content:
            `❌ Ya fue reclamado por <@${ticket.claimedBy}>.`,
          ephemeral: true
        });
      }

      ticket.claimedBy =
        interaction.user.id;

      saveDB();

      await interaction.reply({
        embeds: [
          yellowEmbed(
            "🙋 Ticket reclamado",
            `${interaction.user} atenderá este ticket.`
          )
        ]
      });

      return sendLog(
        interaction.guild,
        "ticket",
        yellowEmbed(
          "🙋 Ticket reclamado",
          `Ticket: ${interaction.channel}\nStaff: ${interaction.user}`
        )
      );
    }

    // ==================================================
    // CLOSE
    // ==================================================

    if (
      interaction.isButton() &&
      interaction.customId === "ticket_close"
    ) {
      const ticket =
        ticketRecordByChannel(
          interaction.guild.id,
          interaction.channel.id
        );

      if (!ticket) {
        return interaction.reply({
          content:
            "❌ Ticket no registrado.",
          ephemeral: true
        });
      }

      const owner =
        ticket.userId ===
        interaction.user.id;

      if (!owner && !isStaff(interaction.member)) {
        return interaction.reply({
          content:
            "❌ No puedes cerrar este ticket.",
          ephemeral: true
        });
      }

      const buttons =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId("ticket_confirm_close")
              .setLabel("Cerrar")
              .setStyle(
                ButtonStyle.Danger
              ),

            new ButtonBuilder()
              .setCustomId("ticket_cancel_close")
              .setLabel("Cancelar")
              .setStyle(
                ButtonStyle.Secondary
              )
          );

      return interaction.reply({
        content:
          "¿Seguro que quieres cerrar este ticket?",
        components: [buttons],
        ephemeral: true
      });
    }

    // CANCEL CLOSE

    if (
      interaction.isButton() &&
      interaction.customId ===
        "ticket_cancel_close"
    ) {
      return interaction.update({
        content:
          "✅ Cierre cancelado.",
        components: []
      });
    }

    // CONFIRM CLOSE

    if (
      interaction.isButton() &&
      interaction.customId ===
        "ticket_confirm_close"
    ) {
      const data =
        guildDB(interaction.guild.id);

      const ticket =
        ticketRecordByChannel(
          interaction.guild.id,
          interaction.channel.id
        );

      if (!ticket) {
        return interaction.update({
          content:
            "❌ Ticket no encontrado.",
          components: []
        });
      }

      ticket.closed = true;
      ticket.closedBy =
        interaction.user.id;
      ticket.closedAt =
        Date.now();

      saveDB();

      const logEmbed =
        yellowEmbed(
          "🔒 Ticket cerrado",
          `Usuario: <@${ticket.userId}>\nCerrado por: ${interaction.user}\nCanal: **${interaction.channel.name}**`
        );

      await sendLog(
        interaction.guild,
        "ticket",
        logEmbed
      );

      await interaction.update({
        content:
          "🔒 Ticket cerrado.\n\n⭐ El usuario podrá valorar la atención del **1 al 5**.",
        components: []
      });

      const ratingRow =
        new ActionRowBuilder()
          .addComponents(
            [1, 2, 3, 4, 5].map(number =>
              new ButtonBuilder()
                .setCustomId(
                  `ticket_rate_${number}_${ticket.userId}`
                )
                .setLabel(`${number}`)
                .setEmoji("⭐")
                .setStyle(
                  ButtonStyle.Secondary
                )
            )
          );

      await interaction.channel.send({
        content:
          `<@${ticket.userId}> ¿Cómo valorarías la atención recibida?`,
        components: [ratingRow]
      });

      await interaction.channel.permissionOverwrites
        .edit(ticket.userId, {
          SendMessages: false
        })
        .catch(() => {});

      setTimeout(async () => {
        if (
          interaction.channel &&
          !interaction.channel.deleted
        ) {
          await interaction.channel
            .delete(
              `Ticket cerrado por ${interaction.user.tag}`
            )
            .catch(() => {});
        }
      }, 60_000);
    }

    // ==================================================
    // RATING
    // ==================================================

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        "ticket_rate_"
      )
    ) {
      const parts =
        interaction.customId.split("_");

      const rating =
        Number(parts[2]);

      const ownerId =
        parts[3];

      if (
        interaction.user.id !== ownerId
      ) {
        return interaction.reply({
          content:
            "❌ Solo el creador del ticket puede valorar la atención.",
          ephemeral: true
        });
      }

      const data =
        guildDB(interaction.guild.id);

      const ticket =
        data.tickets[
          interaction.channel.id
        ];

      if (!ticket) {
        return interaction.reply({
          content:
            "❌ Ticket no encontrado.",
          ephemeral: true
        });
      }

      if (ticket.rating) {
        return interaction.reply({
          content:
            "❌ Ya valoraste este ticket.",
          ephemeral: true
        });
      }

      ticket.rating = rating;
      ticket.ratedAt = Date.now();

      saveDB();

      await interaction.update({
        content:
          `💛 Gracias por valorar la atención con **${"⭐".repeat(rating)}**.`,
        components: []
      });

      await sendLog(
        interaction.guild,
        "ticket",
        yellowEmbed(
          "⭐ Valoración de ticket",
          `Usuario: ${interaction.user}\nValoración: **${rating}/5** ${"⭐".repeat(rating)}\nAtendido por: ${
            ticket.claimedBy
              ? `<@${ticket.claimedBy}>`
              : "Sin reclamar"
          }`
        )
      );

      setTimeout(async () => {
        await interaction.channel
          .delete("Valoración completada")
          .catch(() => {});
      }, 5000);
    }

    // ==================================================
    // ADMIN PANEL BUTTONS
    // ==================================================

    if (
      interaction.isButton() &&
      interaction.customId ===
        "admin_tickets"
    ) {
      if (!isRealAdmin(interaction.member)) {
        return interaction.reply({
          content: "❌ Solo administradores.",
          ephemeral: true
        });
      }

      const data =
        guildDB(interaction.guild.id);

      const categories =
        Object.values(data.ticketTypes)
          .map(
            category =>
              `• **${category.name}** — ${category.question}`
          )
          .join("\n") ||
        "Ninguna";

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🎫 Configuración de tickets",
            `**Categorías actuales:**\n${categories}\n\nUsa:\n\`/addcategory\`\n\`/removecategory\`\n\`/ticketpanel\``
          )
        ],
        ephemeral: true
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId ===
        "admin_logs"
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
            "📋 Logs",
            "Usa `/logs` para configurar logs generales, moderación, tickets, transacciones y niveles."
          )
        ],
        ephemeral: true
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId ===
        "admin_info"
    ) {
      if (!isRealAdmin(interaction.member)) {
        return interaction.reply({
          content: "❌ Solo administradores.",
          ephemeral: true
        });
      }

      const data =
        guildDB(interaction.guild.id);

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "⚙️ Configuración",
`**Rol de staff:** ${
  data.staffRole
    ? `<@&${data.staffRole}>`
    : "No configurado"
}

**Bienvenidas:** ${
  data.channels.welcome
    ? `<#${data.channels.welcome}>`
    : "No configuradas"
}

**Invitaciones:** ${
  data.channels.invites
    ? `<#${data.channels.invites}>`
    : "No configuradas"
}

**Autoroles:** ${data.autoroles.length}

**Categorías de tickets:** ${
  Object.keys(data.ticketTypes).length
}`
          )
        ],
        ephemeral: true
      });
    }

  } catch (error) {
    console.error(
      "Error en interactionCreate:",
      error
    );

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content:
          "❌ Ocurrió un error ejecutando esta acción.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ======================================================
// LOGS DE MENSAJES
// ======================================================

client.on("messageDelete", async message => {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const content =
    message.content || "Contenido no disponible.";

  await sendLog(
    message.guild,
    "general",
    yellowEmbed(
      "🗑️ Mensaje eliminado",
      `**Usuario:** ${
        message.author || "Desconocido"
      }\n**Canal:** ${message.channel}\n\n**Contenido:**\n${content.substring(
        0,
        1500
      )}`
    )
  );
});

client.on(
  "messageUpdate",
  async (oldMessage, newMessage) => {
    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;

    if (
      oldMessage.content ===
      newMessage.content
    ) {
      return;
    }

    await sendLog(
      newMessage.guild,
      "general",
      yellowEmbed(
        "✏️ Mensaje editado",
        `**Usuario:** ${
          newMessage.author
        }\n**Canal:** ${
          newMessage.channel
        }\n\n**Antes:**\n${
          oldMessage.content?.substring(
            0,
            700
          ) || "No disponible"
        }\n\n**Después:**\n${
          newMessage.content?.substring(
            0,
            700
          ) || "No disponible"
        }`
      )
    );
  }
);

// ======================================================
// ERRORES
// ======================================================

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught exception:",
      error
    );
  }
);

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
