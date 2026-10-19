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
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = "n.";
const COLOR = 0xFFD54A;
const DATA_FILE = path.join(__dirname, "data.json");

if (!TOKEN) {
  console.error("❌ Falta DISCORD_TOKEN en las variables de entorno.");
  process.exit(1);
}

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
    Partials.Message,
    Partials.GuildMember
  ]
});

/* =========================================================
   BASE JSON
========================================================= */

function loadDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify({}, null, 2)
      );
    }

    return JSON.parse(
      fs.readFileSync(DATA_FILE, "utf8")
    );
  } catch (error) {
    console.error("❌ Error leyendo data.json:", error);
    return {};
  }
}

const db = loadDB();

function saveDB() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.error("❌ Error guardando data.json:", error);
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
        levelLogs: null,
        giveawayLogs: null
      },

      ticketCategory: null,

      ticketTypes: {
        soporte: {
          name: "Soporte",
          questions: [
            "¿En qué te podemos ayudar?"
          ]
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
        levels: {
          enabled: true,
          channel: null,
          xpMin: 8,
          xpMax: 15,
          cooldown: 60000,
          message:
            "🎉 {usuario} ha subido al nivel **{nivel}**.",
          roleRewards: {}
        }
      },

      economy: {},

      shop: {},

      giveaways: {},

      honeypot: {
        channel: null,
        messageId: null,
        bans: 0
      }
    };

    saveDB();
  }

  const data = db[guildId];

  /* Compatibilidad con data.json antiguo */

  data.channels ||= {};
  data.channels.welcome ||= null;
  data.channels.invites ||= null;
  data.channels.generalLogs ||= null;
  data.channels.moderationLogs ||= null;
  data.channels.ticketLogs ||= null;
  data.channels.transactionLogs ||= null;
  data.channels.levelLogs ||= null;
  data.channels.giveawayLogs ||= null;

  data.ticketTypes ||= {
    soporte: {
      name: "Soporte",
      questions: [
        "¿En qué te podemos ayudar?"
      ]
    }
  };

  data.autoroles ||= [];
  data.warns ||= {};
  data.tickets ||= {};
  data.invites ||= { users: {} };
  data.invites.users ||= {};
  data.levels ||= {};

  data.settings ||= {};
  data.settings.levels ||= {};
  data.settings.levels.enabled ??= true;
  data.settings.levels.channel ||= null;
  data.settings.levels.xpMin ??= 8;
  data.settings.levels.xpMax ??= 15;
  data.settings.levels.cooldown ??= 60000;
  data.settings.levels.message ||=
    "🎉 {usuario} ha subido al nivel **{nivel}**.";
  data.settings.levels.roleRewards ||= {};

  data.economy ||= {};
  data.shop ||= {};
  data.giveaways ||= {};

  data.honeypot ||= {};
  data.honeypot.channel ||= null;
  data.honeypot.messageId ||= null;
  data.honeypot.bans ??= 0;

  return data;
}

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

function isAdmin(member) {
  return !!member &&
    member.permissions.has(
      PermissionFlagsBits.Administrator
    );
}

function isStaff(member) {
  if (!member) return false;

  const data = guildDB(member.guild.id);

  if (isAdmin(member)) return true;

  return !!(
    data.staffRole &&
    member.roles.cache.has(data.staffRole)
  );
}

function isRealAdmin(member) {
  return isAdmin(member);
}

function cleanName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ticketRecordByChannel(guildId, channelId) {
  const data = guildDB(guildId);

  return Object.values(data.tickets).find(
    ticket =>
      ticket.channelId === channelId
  );
}

async function sendLog(guild, channelId, embed) {
  if (!channelId) return;

  const channel =
    guild.channels.cache.get(channelId);

  if (!channel || !channel.isTextBased()) return;

  try {
    await channel.send({
      embeds: [embed]
    });
  } catch {}
}

function getEconomyUser(guildId, userId) {
  const data = guildDB(guildId);

  if (!data.economy[userId]) {
    data.economy[userId] = {
      coins: 0,
      lastWork: 0,
      lastLuck: 0
    };
  }

  return data.economy[userId];
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

function formatTime(ms) {
  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.ceil(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.ceil(minutes / 60);

  return `${hours}h`;
}

function parseDuration(text) {
  if (!text) return null;

  const match =
    /^(\d+)(s|m|h|d)$/i.exec(
      text.trim()
    );

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

/* =========================================================
   NIVELES
========================================================= */

async function addXP(message) {
  if (!message.guild || message.author.bot) return;

  const data = guildDB(
    message.guild.id
  );

  if (!data.settings.levels.enabled) return;

  const user =
    getLevelData(
      message.guild.id,
      message.author.id
    );

  const now = Date.now();

  if (
    now - user.lastXP <
    data.settings.levels.cooldown
  ) {
    return;
  }

  user.lastXP = now;

  const min =
    Math.max(
      1,
      Number(data.settings.levels.xpMin)
    );

  const max =
    Math.max(
      min,
      Number(data.settings.levels.xpMax)
    );

  const amount =
    Math.floor(
      Math.random() *
      (max - min + 1)
    ) + min;

  user.xp += amount;

  let leveledUp = false;

  while (
    user.xp >=
    xpNeeded(user.level)
  ) {
    user.xp -=
      xpNeeded(user.level);

    user.level++;

    leveledUp = true;
  }

  if (!leveledUp) {
    saveDB();
    return;
  }

  saveDB();

  const text =
    data.settings.levels.message
      .replace(
        "{usuario}",
        `<@${message.author.id}>`
      )
      .replace(
        "{nivel}",
        String(user.level)
      );

  const levelChannel =
    data.settings.levels.channel
      ? message.guild.channels.cache.get(
          data.settings.levels.channel
        )
      : message.channel;

  if (levelChannel?.isTextBased()) {
    await levelChannel.send({
      embeds: [
        yellowEmbed(
          "╭・✦・────────────・✦・╮\n       📈 SUBIDA DE NIVEL\n╰・✦・────────────・✦・╯",
          `✨ ${text}\n\n` +
          `💛 Sigue participando en **Nisk Studio** para continuar subiendo.`
        )
      ]
    });
  }

  /* Rol de recompensa */

  const rewardRoleId =
    data.settings.levels.roleRewards[
      String(user.level)
    ];

  if (rewardRoleId) {
    const role =
      message.guild.roles.cache.get(
        rewardRoleId
      );

    if (
      role &&
      message.member &&
      role.position <
        message.guild.members.me.roles.highest.position
    ) {
      await message.member.roles
        .add(role)
        .catch(() => {});
    }
  }

  await sendLog(
    message.guild,
    data.channels.levelLogs,
    yellowEmbed(
      "📈 Nuevo nivel",
      `👤 Usuario: <@${message.author.id}>\n` +
      `🏆 Nivel: **${user.level}**`
    )
  );
}

/* =========================================================
   INVITES
========================================================= */

const inviteCache = new Map();

async function cacheGuildInvites(guild) {
  try {
    const invites =
      await guild.invites.fetch();

    const inviteMap = new Map();

    invites.forEach(invite => {
      inviteMap.set(
        invite.code,
        {
          uses: invite.uses || 0,
          inviter:
            invite.inviter?.id || null
        }
      );
    });

    inviteCache.set(
      guild.id,
      inviteMap
    );
  } catch {}
}

function getInviteUser(
  guildId,
  userId
) {
  const data =
    guildDB(guildId);

  if (
    !data.invites.users[userId]
  ) {
    data.invites.users[userId] = {
      total: 0,
      active: 0,
      left: 0,
      members: []
    };
  }

  data.invites.users[userId].members ||=
    [];

  return data.invites.users[userId];
}

async function detectInvite(guild) {
  try {
    const oldInvites =
      inviteCache.get(
        guild.id
      ) || new Map();

    const newInvites =
      await guild.invites.fetch();

    let usedInvite = null;

    newInvites.forEach(
      invite => {
        const old =
          oldInvites.get(
            invite.code
          );

        if (
          !old ||
          (invite.uses || 0) >
            old.uses
        ) {
          usedInvite = invite;
        }
      }
    );

    const newMap =
      new Map();

    newInvites.forEach(
      invite => {
        newMap.set(
          invite.code,
          {
            uses:
              invite.uses || 0,
            inviter:
              invite.inviter?.id ||
              null
          }
        );
      }
    );

    inviteCache.set(
      guild.id,
      newMap
    );

    return usedInvite;
  } catch {
    return null;
  }
}

/* =========================================================
   HONEYPOT MESSAGE
========================================================= */

async function updateHoneypotCounter(
  guild
) {
  const data =
    guildDB(guild.id);

  if (
    !data.honeypot.channel ||
    !data.honeypot.messageId
  ) {
    return;
  }

  const channel =
    guild.channels.cache.get(
      data.honeypot.channel
    );

  if (!channel?.isTextBased()) {
    return;
  }

  try {
    const message =
      await channel.messages.fetch(
        data.honeypot.messageId
      );

    const row =
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(
            "honeypot_counter"
          )
          .setLabel(
            `Ban: ${data.honeypot.bans}`
          )
          .setEmoji("🔨")
          .setStyle(
            ButtonStyle.Secondary
          )
          .setDisabled(true)
      );

    await message.edit({
      components: [row]
    });
  } catch {}
}

/* =========================================================
   READY
========================================================= */

client.once(
  "ready",
  async () => {
    console.log(
      `✅ ${client.user.tag} está conectado.`
    );

    client.user.setPresence({
      activities: [
        {
          name: "Nisk Studio 💛",
          type: 3
        }
      ],
      status: "online"
    });

    for (
      const guild of
      client.guilds.cache.values()
    ) {
      await cacheGuildInvites(
        guild
      );
    }

    await registerCommands();

    console.log(
      `📌 Servidores: ${client.guilds.cache.size}`
    );
  }
);

/* =========================================================
   JOIN
========================================================= */

client.on(
  "guildMemberAdd",
  async member => {
    const data =
      guildDB(
        member.guild.id
      );

    /* AUTOROLES */

    for (
      const roleId of
      data.autoroles
    ) {
      const role =
        member.guild.roles.cache.get(
          roleId
        );

      if (!role) continue;

      try {
        await member.roles.add(
          role
        );
      } catch {}
    }

    /* INVITE */

    const invite =
      await detectInvite(
        member.guild
      );

    if (invite?.inviter) {
      const inviter =
        getInviteUser(
          member.guild.id,
          invite.inviter
        );

      inviter.total++;
      inviter.active++;

      if (
        !inviter.members.includes(
          member.id
        )
      ) {
        inviter.members.push(
          member.id
        );
      }

      saveDB();

      if (
        data.channels.invites
      ) {
        const channel =
          member.guild.channels.cache.get(
            data.channels.invites
          );

        if (
          channel?.isTextBased()
        ) {
          await channel.send({
            embeds: [
              yellowEmbed(
                "💛・¡Nueva invitación!",
                `👤・${member} se ha unido a Nisk Studio.\n\n` +
                `🔗・Invitado por: <@${invite.inviter}>\n` +
                `✨・<@${invite.inviter}> ahora tiene **${inviter.total}** invitaciones.\n` +
                `👥・Ya somos **${member.guild.memberCount}** miembros.\n\n` +
                `Gracias por ayudar a crecer la comunidad. 💛`
              )
            ]
          });
        }
      }
    }

    /* WELCOME */

    if (
      data.channels.welcome
    ) {
      const channel =
        member.guild.channels.cache.get(
          data.channels.welcome
        );

      if (
        channel?.isTextBased()
      ) {
        await channel.send({
          embeds: [
            yellowEmbed(
              "╭・✦・────────────・✦・╮\n　　　💛 NISK STUDIO\n╰・✦・────────────・✦・╯",
              `👋・¡Bienvenido/a ${member}!\n\n` +
              `Nos alegra tenerte en Nisk Studio, una comunidad donde podrás hablar, compartir y aprender sobre programación, bots, juegos y mucho más.\n\n` +
              `📌・Lee las reglas para evitar problemas.\n` +
              `💬・Participa y conoce a la comunidad.\n` +
              `💻・Comparte tus proyectos e ideas.\n` +
              `🎮・Diviértete y pasa un buen rato.\n\n` +
              `Esperamos que disfrutes tu estancia y formes parte de esta comunidad. 💛\n\n` +
              `╭・──────────────・╮\n　✨ ¡Gracias por unirte!\n╰・──────────────・╯`
            )
          ]
        });
      }
    }
  }
);

/* =========================================================
   LEAVE
========================================================= */

client.on(
  "guildMemberRemove",
  async member => {
    const data =
      guildDB(
        member.guild.id
      );

    for (
      const userId of
      Object.keys(
        data.invites.users
      )
    ) {
      const inviter =
        data.invites.users[
          userId
        ];

      inviter.members ||= [];

      const index =
        inviter.members.indexOf(
          member.id
        );

      if (index !== -1) {
        inviter.members.splice(
          index,
          1
        );

        if (
          inviter.active > 0
        ) {
          inviter.active--;
        }

        inviter.left++;

        saveDB();

        break;
      }
    }

    await sendLog(
      member.guild,
      data.channels.generalLogs,
      yellowEmbed(
        "👋 Miembro salió",
        `👤 ${member.user.tag} ha salido del servidor.`
      )
    );
  }
);

/* =========================================================
   MENSAJES
========================================================= */

client.on(
  "messageCreate",
  async message => {
    if (!message.guild) return;
    if (message.author.bot) return;

    const data =
      guildDB(
        message.guild.id
      );

    /* HONEYPOT */

    if (
      data.honeypot.channel &&
      message.channel.id ===
        data.honeypot.channel
    ) {
      const member =
        message.member;

      if (
        member &&
        !member.user.bot &&
        !member.permissions.has(
          PermissionFlagsBits.Administrator
        ) &&
        member.id !==
          message.guild.ownerId
      ) {
        try {
          await message.delete()
            .catch(() => {});

          if (
            member.bannable &&
            message.guild.members.me &&
            message.guild.members.me.permissions.has(
              PermissionFlagsBits.BanMembers
            )
          ) {
            data.honeypot.bans++;

            saveDB();

            await member.ban({
              reason:
                "Honeypot de seguridad de Nisk Studio"
            }).catch(() => {});

            await updateHoneypotCounter(
              message.guild
            );

            await sendLog(
              message.guild,
              data.channels.moderationLogs,
              yellowEmbed(
                "🍯 Honeypot activado",
                `🚨 Una cuenta escribió en el canal Honeypot.\n\n` +
                `👤 Usuario: **${member.user.tag}**\n` +
                `🆔 ID: \`${member.id}\`\n` +
                `🔨 Acción: **Ban automático**\n` +
                `📊 Bans del Honeypot: **${data.honeypot.bans}**`
              )
            );
          }
        } catch {}
      }

      return;
    }

    await addXP(message);

    if (
      !message.content
        .toLowerCase()
        .startsWith(PREFIX)
    ) {
      return;
    }

    const args =
      message.content
        .slice(PREFIX.length)
        .trim()
        .split(/\s+/);

    const command =
      args
        .shift()
        ?.toLowerCase();

    if (!command) return;

    /* =====================================================
       HELP
    ===================================================== */

    if (command === "help") {
      return sendHelp(
        message,
        false
      );
    }

    /* =====================================================
       ADMIN
    ===================================================== */

    if (command === "admin") {
      return sendAdminMenu(
        message,
        false
      );
    }

    /* =====================================================
       STAFF ROLE
    ===================================================== */

    if (command === "staffrole") {
      if (!isAdmin(message.member)) {
        return message.reply(
          "⛔ Solo administradores."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "Uso: `n.staffrole @Rol`"
        );
      }

      data.staffRole =
        role.id;

      saveDB();

      return message.reply({
        embeds: [
          yellowEmbed(
            "🛡️ Staff configurado",
            `El rol de Staff ahora es ${role}.\n\n` +
            `El Staff podrá utilizar las funciones operativas de moderación y tickets, pero no podrá modificar la configuración del bot.`
          )
        ]
      });
    }

    /* =====================================================
       TICKET PANEL
    ===================================================== */

    if (
      command ===
      "ticketpanel"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "⛔ Solo administradores."
        );
      }

      return sendTicketPanel(
        message.channel,
        data
      );
    }

    /* =====================================================
       WELCOME
    ===================================================== */

    if (command === "welcome") {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "⛔ Solo administradores."
        );
      }

      const channel =
        message.mentions.channels.first();

      if (!channel) {
        return message.reply(
          "Uso: `n.welcome #canal`"
        );
      }

      data.channels.welcome =
        channel.id;

      saveDB();

      return message.reply({
        embeds: [
          yellowEmbed(
            "👋 Bienvenida configurada",
            `El canal de bienvenida ahora es ${channel}.`
          )
        ]
      });
    }

    /* =====================================================
       INVITE
    ===================================================== */

    if (command === "invite") {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "⛔ Solo administradores."
        );
      }

      const channel =
        message.mentions.channels.first();

      if (!channel) {
        return message.reply(
          "Uso: `n.invite #canal`"
        );
      }

      data.channels.invites =
        channel.id;

      saveDB();

      return message.reply({
        embeds: [
          yellowEmbed(
            "🔗 Invitaciones configuradas",
            `Las nuevas invitaciones se anunciarán en ${channel}.`
          )
        ]
      });
    }

    /* =====================================================
       INVITES CHECK
    ===================================================== */

    if (
      command ===
      "invitescheck"
    ) {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const user =
        message.mentions.users.first() ||
        message.author;

      const inviteData =
        data.invites.users[
          user.id
        ] || {
          total: 0,
          active: 0,
          left: 0,
          members: []
        };

      return message.reply({
        embeds: [
          yellowEmbed(
            "🔗 Estadísticas de invitaciones",
            `👤 Usuario: ${user}\n\n` +
            `👥 Miembros invitados: **${inviteData.total}**\n` +
            `🟢 Actualmente en el servidor: **${inviteData.active}**\n` +
            `🔴 Invitados que se fueron: **${inviteData.left}**\n` +
            `📊 Total registrado: **${inviteData.total}**`
          )
        ]
      });
    }

    /* =====================================================
       EMBED
    ===================================================== */

    if (command === "embed") {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const color =
        args.shift() ||
        "#FFD54A";

      const text =
        args.join(" ");

      if (!text) {
        return message.reply(
          "Uso: `n.embed #FFD54A mensaje`"
        );
      }

      const embed =
        new EmbedBuilder()
          .setColor(color)
          .setDescription(text)
          .setTimestamp()
          .setFooter({
            text:
              "Nisk Studio | Programación"
          });

      const image =
        message.attachments.first();

      if (image) {
        embed.setImage(
          image.url
        );
      }

      await message.channel.send({
        embeds: [embed]
      });

      return message.delete()
        .catch(() => {});
    }

    /* =====================================================
       PAY
    ===================================================== */

    if (command === "pay") {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const user =
        message.mentions.users.first();

      const amount =
        args.find(
          x => !isNaN(
            Number(x)
          )
        );

      if (!user || !amount) {
        return message.reply(
          "Uso: `n.pay @usuario cantidad concepto`"
        );
      }

      const concept =
        args
          .filter(
            x => x !== amount
          )
          .join(" ");

      const embed =
        yellowEmbed(
          "💳 Transacción registrada",
          `👤 Usuario: ${user}\n` +
          `💰 Cantidad: **${amount}**\n` +
          `📝 Concepto: ${concept || "Sin concepto"}\n` +
          `👮 Registrado por: ${message.author}`
        );

      await message.channel.send({
        embeds: [embed]
      });

      await sendLog(
        message.guild,
        data.channels.transactionLogs,
        embed
      );

      return;
    }

    /* =====================================================
       RANK
    ===================================================== */

    if (command === "rank") {
      const user =
        message.mentions.users.first() ||
        message.author;

      const levelData =
        getLevelData(
          message.guild.id,
          user.id
        );

      return message.reply({
        embeds: [
          yellowEmbed(
            "📈 Perfil de nivel",
            `👤 ${user}\n\n` +
            `🏆 Nivel: **${levelData.level}**\n` +
            `✨ XP: **${levelData.xp}/${xpNeeded(levelData.level)}**`
          )
        ]
      });
    }

    /* =====================================================
       BALANCE
    ===================================================== */

    if (command === "balance") {
      const user =
        message.mentions.users.first() ||
        message.author;

      const account =
        getEconomyUser(
          message.guild.id,
          user.id
        );

      saveDB();

      return message.reply({
        embeds: [
          yellowEmbed(
            "💰 Coins Nisk",
            `👤 Usuario: ${user}\n\n` +
            `💰 Saldo: **${account.coins} Coins Nisk**`
          )
        ]
      });
    }

    /* =====================================================
       WORK
    ===================================================== */

    if (command === "work") {
      const account =
        getEconomyUser(
          message.guild.id,
          message.author.id
        );

      const cooldown =
        30000;

      const remaining =
        cooldown -
        (Date.now() -
          account.lastWork);

      if (remaining > 0) {
        return message.reply(
          `💼 Debes esperar **${formatTime(remaining)}** para volver a trabajar.`
        );
      }

      const reward =
        Math.floor(
          Math.random() *
          201
        ) + 100;

      account.coins += reward;
      account.lastWork =
        Date.now();

      saveDB();

      return message.reply({
        embeds: [
          yellowEmbed(
            "💼 Trabajo completado",
            `👤 ${message.author}\n\n` +
            `💰 Has ganado **${reward} Coins Nisk**.\n\n` +
            `💳 Nuevo saldo: **${account.coins} Coins Nisk**`
          )
        ]
      });
    }

    /* =====================================================
       SHOP
    ===================================================== */

    if (command === "shop") {
      return sendShop(
        message,
        false
      );
    }

    /* =====================================================
       INVENTORY
    ===================================================== */

    if (command === "inventory") {
      return sendInventory(
        message,
        false
      );
    }

    /* =====================================================
       LEADERBOARD
    ===================================================== */

    if (
      command ===
      "leaderboard"
    ) {
      return sendLeaderboard(
        message,
        false
      );
    }

    /* =====================================================
       LUCK
    ===================================================== */

    if (command === "luck") {
      return playLuck(
        message,
        false
      );
    }

    /* =====================================================
       PURGE
    ===================================================== */

    if (command === "purge") {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const amount =
        parseInt(
          args[0]
        );

      if (
        isNaN(amount) ||
        amount < 1 ||
        amount > 100
      ) {
        return message.reply(
          "Debes indicar una cantidad entre 1 y 100."
        );
      }

      await message.channel.bulkDelete(
        amount + 1,
        true
      );

      const msg =
        await message.channel.send({
          embeds: [
            yellowEmbed(
              "🧹 Mensajes eliminados",
              `Se eliminaron **${amount}** mensajes.\n` +
              `👮 Acción realizada por ${message.author}.`
            )
          ]
        });

      setTimeout(
        () =>
          msg.delete()
            .catch(() => {}),
        5000
      );

      return;
    }

    /* =====================================================
       BAN
    ===================================================== */

    if (command === "ban") {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "Uso: `n.ban @usuario [razón]`"
        );
      }

      if (
        !target.bannable
      ) {
        return message.reply(
          "❌ No puedo banear a ese usuario."
        );
      }

      const reason =
        args
          .filter(
            x =>
              !x.includes(
                target.id
              )
          )
          .join(" ") ||
        "Sin razón";

      await target.ban({
        reason
      });

      await sendLog(
        message.guild,
        data.channels.moderationLogs,
        yellowEmbed(
          "🔨 Usuario baneado",
          `👤 Usuario: **${target.user.tag}**\n` +
          `👮 Moderador: ${message.author}\n` +
          `📝 Razón: ${reason}`
        )
      );

      return message.reply({
        embeds: [
          yellowEmbed(
            "🔨 Usuario baneado",
            `👤 ${target.user.tag}\n` +
            `📝 Razón: ${reason}`
          )
        ]
      });
    }

    /* =====================================================
       KICK
    ===================================================== */

    if (command === "kick") {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "Uso: `n.kick @usuario [razón]`"
        );
      }

      if (
        !target.kickable
      ) {
        return message.reply(
          "❌ No puedo expulsar a ese usuario."
        );
      }

      const reason =
        args.join(" ") ||
        "Sin razón";

      await target.kick(
        reason
      );

      await sendLog(
        message.guild,
        data.channels.moderationLogs,
        yellowEmbed(
          "👢 Usuario expulsado",
          `👤 Usuario: **${target.user.tag}**\n` +
          `👮 Moderador: ${message.author}\n` +
          `📝 Razón: ${reason}`
        )
      );

      return message.reply({
        embeds: [
          yellowEmbed(
            "👢 Usuario expulsado",
            `👤 ${target.user.tag}\n` +
            `📝 Razón: ${reason}`
          )
        ]
      });
    }

    /* =====================================================
       MUTE
    ===================================================== */

    if (command === "mute") {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const target =
        message.mentions.members.first();

      const minutes =
        Number(
          args.find(
            x =>
              !isNaN(
                Number(x)
              )
          )
        );

      if (
        !target ||
        !minutes ||
        minutes < 1
      ) {
        return message.reply(
          "Uso: `n.mute @usuario minutos [razón]`"
        );
      }

      if (
        !target.moderatable
      ) {
        return message.reply(
          "❌ No puedo aplicar timeout a ese usuario."
        );
      }

      const reason =
        args
          .filter(
            x =>
              !/^\d+$/.test(x)
          )
          .join(" ") ||
        "Sin razón";

      await target.timeout(
        minutes * 60000,
        reason
      );

      await sendLog(
        message.guild,
        data.channels.moderationLogs,
        yellowEmbed(
          "🔇 Timeout aplicado",
          `👤 Usuario: **${target.user.tag}**\n` +
          `⏱️ Duración: **${minutes} minutos**\n` +
          `👮 Moderador: ${message.author}\n` +
          `📝 Razón: ${reason}`
        )
      );

      return message.reply({
        embeds: [
          yellowEmbed(
            "🔇 Usuario silenciado",
            `👤 ${target.user.tag}\n` +
            `⏱️ Duración: **${minutes} minutos**`
          )
        ]
      });
    }

    /* =====================================================
       UNMUTE
    ===================================================== */

    if (command === "unmute") {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "Uso: `n.unmute @usuario`"
        );
      }

      await target.timeout(
        null
      );

      return message.reply({
        embeds: [
          yellowEmbed(
            "🔊 Timeout retirado",
            `👤 ${target}\n\n` +
            `El timeout ha sido retirado correctamente.`
          )
        ]
      });
    }

    /* =====================================================
       WARN
    ===================================================== */

    if (command === "warn") {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const target =
        message.mentions.users.first();

      if (!target) {
        return message.reply(
          "Uso: `n.warn @usuario razón`"
        );
      }

      const reason =
        args
          .filter(
            x =>
              !x.includes(
                target.id
              )
          )
          .join(" ") ||
        "Sin razón";

      data.warns[target.id] ||=
        [];

      data.warns[target.id].push({
        reason,
        moderator:
          message.author.id,
        date: Date.now()
      });

      saveDB();

      return message.reply({
        embeds: [
          yellowEmbed(
            "⚠️ Advertencia",
            `👤 Usuario: ${target}\n` +
            `📝 Razón: ${reason}\n` +
            `👮 Moderador: ${message.author}`
          )
        ]
      });
    }

    /* =====================================================
       WARNINGS
    ===================================================== */

    if (
      command ===
      "warnings"
    ) {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const user =
        message.mentions.users.first() ||
        message.author;

      const warns =
        data.warns[user.id] ||
        [];

      return message.reply({
        embeds: [
          yellowEmbed(
            "📋 Advertencias",
            warns.length
              ? warns
                  .map(
                    (w, i) =>
                      `**${i + 1}.** ${w.reason}\n👮 <@${w.moderator}>`
                  )
                  .join(
                    "\n\n"
                  )
              : `${user} no tiene advertencias registradas.`
          )
        ]
      });
    }

    /* =====================================================
       INTERACCIONES
    ===================================================== */

    const interactions = {
      hug: {
        title: "🤗 ABRAZO",
        text:
          "le ha dado un gran abrazo a",
        extra:
          "Parece que alguien necesitaba un poquito de buena energía por aquí. ✨"
      },

      highfive: {
        title: "🙌 HIGH FIVE",
        text:
          "le ha chocado los cinco a",
        extra:
          "¡Esa energía se siente hasta aquí! ⚡"
      },

      poke: {
        title: "👉 POKE",
        text:
          "ha dado un pequeño toque a",
        extra:
          "¡Ey! ¿Qué está pasando por aquí? 👀"
      },

      clap: {
        title: "👏 APLAUSO",
        text:
          "le ha dado un aplauso a",
        extra:
          "¡Momento de reconocer el esfuerzo! ✨"
      },

      wave: {
        title: "👋 SALUDO",
        text:
          "ha saludado a",
        extra:
          "¡Qué bueno verte por Nisk Studio! 💛"
      },

      gift: {
        title: "🎁 REGALO",
        text:
          "le ha enviado un regalo simbólico a",
        extra:
          "¡Un pequeño detalle para alegrar el día! 🎀"
      },

      cookie: {
        title: "🍪 GALLETA",
        text:
          "le ha dado una galleta a",
        extra:
          "¡Una galletita nunca viene mal! 🍪"
      },

      compliment: {
        title: "✨ CUMPLIDO",
        text:
          "le ha dejado un cumplido a",
        extra:
          "¡Las buenas palabras siempre suman! 💛"
      },

      laugh: {
        title: "😂 RISA",
        text:
          "se ha reído con",
        extra:
          "¡La diversión continúa en Nisk Studio! 😂"
      },

      challenge: {
        title: "⚔️ RETO",
        text:
          "ha retado a",
        extra:
          "¡Que empiece el desafío! 🔥"
      }
    };

    if (
      interactions[command]
    ) {
      const target =
        message.mentions.users.first();

      if (!target) {
        return message.reply(
          `Uso: \`n.${command} @usuario\``
        );
      }

      const info =
        interactions[command];

      return message.channel.send({
        embeds: [
          yellowEmbed(
            `╭・✦・──────────────・✦・╮\n             ${info.title}\n╰・✦・──────────────・✦・╯`,
            `💛 ${message.author} ${info.text} ${target}.\n\n` +
            `${info.extra}\n\n` +
            `🤝 **Nisk Studio | Interacciones**`
          )
        ]
      });
    }

    /* =====================================================
       SORTEO
    ===================================================== */

    if (
      command ===
      "sorteo"
    ) {
      return createGiveawayPrefix(
        message,
        args,
        data
      );
    }

    /* =====================================================
       SHOP BUY
    ===================================================== */

    if (
      command ===
      "buy"
    ) {
      return buyShopItem(
        message,
        args[0],
        false
      );
    }

    /* =====================================================
       MODERACIÓN EXTRA
    ===================================================== */

    if (
      command ===
      "lock"
    ) {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: false
        }
      );

      return message.reply({
        embeds: [
          yellowEmbed(
            "🔒 Canal bloqueado",
            `Este canal ha sido bloqueado por ${message.author}.`
          )
        ]
      });
    }

    if (
      command ===
      "unlock"
    ) {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages: null
        }
      );

      return message.reply({
        embeds: [
          yellowEmbed(
            "🔓 Canal desbloqueado",
            `Este canal vuelve a estar disponible.`
          )
        ]
      });
    }

    if (
      command ===
      "slowmode"
    ) {
      if (
        !isStaff(
          message.member
        )
      ) {
        return message.reply(
          "⛔ No tienes permisos."
        );
      }

      const seconds =
        Number(args[0]);

      if (
        isNaN(seconds) ||
        seconds < 0 ||
        seconds > 21600
      ) {
        return message.reply(
          "Uso: `n.slowmode segundos` (0-21600)"
        );
      }

      await message.channel.setRateLimitPerUser(
        seconds
      );

      return message.reply({
        embeds: [
          yellowEmbed(
            "🐌 Slowmode",
            `El slowmode ha sido establecido en **${seconds} segundos**.`
          )
        ]
      });
    }

    /* =====================================================
       AUTOROLE ADD/REMOVE
    ===================================================== */

    if (
      command ===
      "autoroleadd"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "⛔ Solo administradores."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "Uso: `n.autoroleadd @rol`"
        );
      }

      if (
        !data.autoroles.includes(
          role.id
        )
      ) {
        data.autoroles.push(
          role.id
        );
      }

      saveDB();

      return message.reply({
        embeds: [
          yellowEmbed(
            "🎭 Autorol añadido",
            `${role} será entregado automáticamente a los nuevos miembros.`
          )
        ]
      });
    }

    if (
      command ===
      "autoroleremove"
    ) {
      if (
        !isAdmin(
          message.member
        )
      ) {
        return message.reply(
          "⛔ Solo administradores."
        );
      }

      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "Uso: `n.autoroleremove @rol`"
        );
      }

      data.autoroles =
        data.autoroles.filter(
          id =>
            id !== role.id
        );

      saveDB();

      return message.reply({
        embeds: [
          yellowEmbed(
            "🗑️ Autorol eliminado",
            `${role} ya no será entregado automáticamente.`
          )
        ]
      });
    }
  }
);

/* =========================================================
   FUNCIONES DE MENÚS
========================================================= */

function getAdminMenu() {
  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "admin_menu"
      )
      .setPlaceholder(
        "⚙️ Selecciona una sección"
      )
      .addOptions([
        {
          label: "Tickets",
          value: "tickets",
          emoji: "🎫"
        },
        {
          label: "Niveles",
          value: "levels",
          emoji: "📈"
        },
        {
          label: "Logs",
          value: "logs",
          emoji: "📋"
        },
        {
          label: "Bienvenida",
          value: "welcome",
          emoji: "👋"
        },
        {
          label: "Invitaciones",
          value: "invites",
          emoji: "🔗"
        },
        {
          label: "Autoroles",
          value: "autoroles",
          emoji: "🎭"
        },
        {
          label: "Economía",
          value: "economy",
          emoji: "💰"
        },
        {
          label: "Sorteos",
          value: "giveaways",
          emoji: "🎉"
        },
        {
          label: "Moderación",
          value: "moderation",
          emoji: "🛡️"
        },
        {
          label: "Seguridad",
          value: "security",
          emoji: "🍯"
        },
        {
          label: "Configuración",
          value: "config",
          emoji: "⚙️"
        }
      ]);

  return menu;
}

function getHelpMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId(
      "help_menu"
    )
    .setPlaceholder(
      "📚 Selecciona una categoría"
    )
    .addOptions([
      {
        label: "Economía",
        value: "economy",
        emoji: "💰"
      },
      {
        label: "Niveles",
        value: "levels",
        emoji: "📈"
      },
      {
        label: "Diversión",
        value: "fun",
        emoji: "🍀"
      },
      {
        label: "Interacción",
        value: "interaction",
        emoji: "🤝"
      },
      {
        label: "Utilidades",
        value: "utility",
        emoji: "👤"
      },
      {
        label: "Información",
        value: "info",
        emoji: "ℹ️"
      }
    ]);
}

async function sendAdminMenu(
  source,
  slash = true
) {
  const member =
    slash
      ? source.member
      : source.member;

  if (!isAdmin(member)) {
    if (slash) {
      return source.reply({
        content:
          "⛔ Solo administradores.",
        ephemeral: true
      });
    }

    return source.reply(
      "⛔ Solo administradores."
    );
  }

  const embed =
    yellowEmbed(
      "╭・✦・──────────────・✦・╮\n        ⚙️ PANEL ADMIN\n╰・✦・──────────────・✦・╯",
      `Bienvenido al panel de administración de **Nisk Studio**.\n\n` +
      `Desde aquí puedes consultar y administrar las diferentes áreas del bot.\n\n` +
      `🔐 **Acceso:** Administradores\n` +
      `🛡️ El Staff operativo no puede modificar esta configuración.\n\n` +
      `Selecciona una sección en el menú inferior.`
    );

  const payload = {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        getAdminMenu()
      )
    ]
  };

  if (slash) {
    return source.reply(
      payload
    );
  }

  return source.reply(
    payload
  );
}

async function sendHelp(
  source,
  slash = true
) {
  const embed =
    yellowEmbed(
      "╭・✦・──────────────・✦・╮\n           📚 NISK HELP\n╰・✦・──────────────・✦・╯",
      `Bienvenido al centro de ayuda de **Nisk Studio**.\n\n` +
      `Aquí encontrarás los comandos disponibles para los miembros.\n\n` +
      `Selecciona una categoría para consultar sus comandos.\n\n` +
      `💛 **Nisk Studio | Programación**`
    );

  const payload = {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        getHelpMenu()
      )
    ]
  };

  return source.reply(
    payload
  );
}

/* =========================================================
   TICKET PANEL
========================================================= */

async function sendTicketPanel(
  channel,
  data,
  interaction = null
) {
  const options =
    Object.entries(
      data.ticketTypes
    )
      .slice(0, 25)
      .map(
        ([key, type]) => ({
          label:
            type.name.slice(
              0,
              100
            ),
          description:
            `Abrir un ticket de ${type.name}`.slice(
              0,
              100
            ),
          value: key,
          emoji: "🎫"
        })
      );

  if (!options.length) {
    if (interaction) {
      return interaction.reply({
        content:
          "❌ No hay categorías configuradas.",
        ephemeral: true
      });
    }

    return channel.send(
      "❌ No hay categorías configuradas."
    );
  }

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "ticket_type"
      )
      .setPlaceholder(
        "🎫 Selecciona el tipo de ticket"
      )
      .addOptions(
        options
      );

  const payload = {
    embeds: [
      yellowEmbed(
        "╭・✦・──────────────・✦・╮\n             🎫 TICKETS\n╰・✦・──────────────・✦・╯",
        `¿Necesitas ayuda con algo?\n\n` +
        `Selecciona la categoría que mejor describa tu solicitud.\n\n` +
        `📝 Antes de crear el ticket tendrás que responder algunas preguntas.\n` +
        `👮 Nuestro equipo revisará tu solicitud.\n` +
        `💛 Gracias por utilizar el sistema de soporte.`
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        menu
      )
    ]
  };

  if (interaction) {
    return interaction.reply(
      payload
    );
  }

  return channel.send(
    payload
  );
}

/* =========================================================
   SHOP
========================================================= */

function defaultShop(data) {
  if (
    Object.keys(data.shop).length
  ) {
    return;
  }

  data.shop = {
    "rol-premium": {
      name: "Rol Premium",
      description:
        "Un rol especial de la comunidad.",
      price: 1000,
      roleId: null
    },

    "rol-vip": {
      name: "Rol VIP",
      description:
        "Un rol destacado para miembros.",
      price: 2500,
      roleId: null
    }
  };
}

async function sendShop(
  source,
  slash = true
) {
  const data =
    guildDB(
      source.guild.id
    );

  defaultShop(data);
  saveDB();

  const entries =
    Object.entries(
      data.shop
    );

  const description =
    entries.length
      ? entries
          .map(
            ([id, item]) =>
              `### 🛍️ ${item.name}\n` +
              `📝 ${item.description}\n` +
              `💰 Precio: **${item.price} Coins Nisk**\n` +
              `🆔 \`${id}\``
          )
          .join("\n\n")
      : "La tienda está vacía.";

  const embed =
    yellowEmbed(
      "╭・✦・──────────────・✦・╮\n             🛍️ TIENDA\n╰・✦・──────────────・✦・╯",
      `${description}\n\n` +
      `💡 Compra un artículo con \`/buy\` o \`n.buy\`.`
    );

  if (slash) {
    return source.reply({
      embeds: [embed]
    });
  }

  return source.reply({
    embeds: [embed]
  });
}

async function sendInventory(
  source,
  slash = true
) {
  const data =
    guildDB(
      source.guild.id
    );

  const user =
    source.user ||
    source.author;

  const account =
    getEconomyUser(
      source.guild.id,
      user.id
    );

  account.inventory ||=
    [];

  const text =
    account.inventory.length
      ? account.inventory
          .map(
            id =>
              `• \`${id}\``
          )
          .join("\n")
      : "Tu inventario está vacío.";

  const embed =
    yellowEmbed(
      "🎒 Inventario",
      `👤 ${user}\n\n` +
      `${text}`
    );

  return source.reply({
    embeds: [embed]
  });
}

async function sendLeaderboard(
  source,
  slash = true
) {
  const data =
    guildDB(
      source.guild.id
    );

  const sorted =
    Object.entries(
      data.economy
    )
      .sort(
        (a, b) =>
          (b[1].coins || 0) -
          (a[1].coins || 0)
      )
      .slice(0, 10);

  if (!sorted.length) {
    return source.reply({
      embeds: [
        yellowEmbed(
          "🏆 Leaderboard",
          "Todavía no hay datos de economía."
        )
      ]
    });
  }

  const lines = [];

  for (
    let i = 0;
    i < sorted.length;
    i++
  ) {
    const [
      userId,
      account
    ] = sorted[i];

    lines.push(
      `**${i + 1}.** <@${userId}> — **${account.coins || 0} Coins Nisk**`
    );
  }

  return source.reply({
    embeds: [
      yellowEmbed(
        "🏆 TOP 10 — COINS NISK",
        lines.join("\n")
      )
    ]
  });
}

async function buyShopItem(
  source,
  itemId,
  slash = true
) {
  const data =
    guildDB(
      source.guild.id
    );

  defaultShop(data);

  const user =
    source.user ||
    source.author;

  const item =
    data.shop[itemId];

  if (!item) {
    return source.reply({
      content:
        "❌ Ese artículo no existe.",
      ephemeral: true
    });
  }

  const account =
    getEconomyUser(
      source.guild.id,
      user.id
    );

  account.inventory ||=
    [];

  if (
    account.coins <
    item.price
  ) {
    return source.reply({
      content:
        `❌ Necesitas **${item.price} Coins Nisk** para comprar este artículo.`,
      ephemeral: true
    });
  }

  account.coins -=
    item.price;

  account.inventory.push(
    itemId
  );

  saveDB();

  if (
    item.roleId
  ) {
    const member =
      await source.guild.members
        .fetch(user.id)
        .catch(() => null);

    const role =
      source.guild.roles.cache.get(
        item.roleId
      );

    if (
      member &&
      role
    ) {
      await member.roles
        .add(role)
        .catch(() => {});
    }
  }

  return source.reply({
    embeds: [
      yellowEmbed(
        "🛍️ Compra realizada",
        `👤 ${user}\n\n` +
        `📦 Artículo: **${item.name}**\n` +
        `💰 Precio: **${item.price} Coins Nisk**\n\n` +
        `💳 Saldo restante: **${account.coins} Coins Nisk**`
      )
    ]
  });
}

/* =========================================================
   LUCK
========================================================= */

async function playLuck(
  source,
  slash = true
) {
  const data =
    guildDB(
      source.guild.id
    );

  const user =
    source.user ||
    source.author;

  const account =
    getEconomyUser(
      source.guild.id,
      user.id
    );

  const cooldown =
    30000;

  const remaining =
    cooldown -
    (Date.now() -
      account.lastLuck);

  if (remaining > 0) {
    return source.reply({
      content:
        `🍀 Debes esperar **${formatTime(remaining)}** para volver a usar Luck.`,
      ephemeral: true
    });
  }

  const rewards = [
    0,
    0,
    50,
    75,
    100,
    150,
    200,
    300
  ];

  const reward =
    rewards[
      Math.floor(
        Math.random() *
        rewards.length
      )
    ];

  account.lastLuck =
    Date.now();

  account.coins +=
    reward;

  saveDB();

  return source.reply({
    embeds: [
      yellowEmbed(
        "🍀 LUCK",
        reward > 0
          ? `✨ ¡La suerte estuvo de tu lado!\n\n` +
            `💰 Ganaste **${reward} Coins Nisk**.\n\n` +
            `💳 Nuevo saldo: **${account.coins} Coins Nisk**`
          : `😅 Esta vez no hubo recompensa.\n\n` +
            `💰 No perdiste ninguna moneda.\n\n` +
            `Puedes volver a intentarlo después.`
      )
    ]
  });
}

/* =========================================================
   SORTEOS
========================================================= */

async function createGiveaway(
  interaction,
  duration,
  winners,
  prize
) {
  const data =
    guildDB(
      interaction.guild.id
    );

  const channel =
    interaction.channel;

  const endAt =
    Date.now() + duration;

  const id =
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  data.giveaways[id] = {
    id,
    channelId: channel.id,
    messageId: null,
    prize,
    winners,
    endAt,
    participants: [],
    ended: false,
    hostId:
      interaction.user.id
  };

  const joinButton =
    new ButtonBuilder()
      .setCustomId(
        `giveaway_join_${id}`
      )
      .setLabel(
        "Participar"
      )
      .setEmoji("🎉")
      .setStyle(
        ButtonStyle.Primary
      );

  const embed =
    yellowEmbed(
      "╭・✦・──────────────・✦・╮\n             🎉 SORTEO\n╰・✦・──────────────・✦・╯",
      `🎁 **Premio:** ${prize}\n\n` +
      `🏆 **Ganadores:** ${winners}\n` +
      `⏰ **Finaliza:** <t:${Math.floor(endAt / 1000)}:R>\n\n` +
      `👤 Organizado por: ${interaction.user}\n\n` +
      `Pulsa el botón de abajo para participar.\n\n` +
      `💛 **Nisk Studio | Sorteos**`
    );

  const msg =
    await channel.send({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          joinButton
        )
      ]
    });

  data.giveaways[id].messageId =
    msg.id;

  saveDB();

  await interaction.reply({
    embeds: [
      yellowEmbed(
        "🎉 Sorteo creado",
        `El sorteo se ha publicado correctamente en ${channel}.\n\n` +
        `🎁 Premio: **${prize}**\n` +
        `🏆 Ganadores: **${winners}**\n` +
        `⏰ Duración: **${formatTime(duration)}**`
      )
    ],
    ephemeral: true
  });

  setTimeout(
    () =>
      finishGiveaway(
        interaction.guild,
        id
      ),
    duration
  );
}

async function createGiveawayPrefix(
  message,
  args,
  data
) {
  if (
    !isStaff(
      message.member
    )
  ) {
    return message.reply(
      "⛔ No tienes permisos."
    );
  }

  const duration =
    parseDuration(
      args[0]
    );

  const winners =
    Number(args[1]);

  const prize =
    args
      .slice(2)
      .join(" ");

  if (
    !duration ||
    !winners ||
    winners < 1 ||
    winners > 20 ||
    !prize
  ) {
    return message.reply(
      "Uso: `n.sorteo 1h 1 Premio`\n\n" +
      "Ejemplo: `n.sorteo 30m 2 Discord Nitro`"
    );
  }

  const endAt =
    Date.now() +
    duration;

  const id =
    `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  data.giveaways[id] = {
    id,
    channelId:
      message.channel.id,
    messageId: null,
    prize,
    winners,
    endAt,
    participants: [],
    ended: false,
    hostId:
      message.author.id
  };

  const button =
    new ButtonBuilder()
      .setCustomId(
        `giveaway_join_${id}`
      )
      .setLabel(
        "Participar"
      )
      .setEmoji("🎉")
      .setStyle(
        ButtonStyle.Primary
      );

  const giveaway =
    await message.channel.send({
      embeds: [
        yellowEmbed(
          "╭・✦・──────────────・✦・╮\n             🎉 SORTEO\n╰・✦・──────────────・✦・╯",
          `🎁 **Premio:** ${prize}\n\n` +
          `🏆 **Ganadores:** ${winners}\n` +
          `⏰ **Finaliza:** <t:${Math.floor(endAt / 1000)}:R>\n\n` +
          `👤 Organizado por: ${message.author}\n\n` +
          `Pulsa el botón para participar.\n\n` +
          `💛 **Nisk Studio | Sorteos**`
        )
      ],
      components: [
        new ActionRowBuilder().addComponents(
          button
        )
      ]
    });

  data.giveaways[id].messageId =
    giveaway.id;

  saveDB();

  setTimeout(
    () =>
      finishGiveaway(
        message.guild,
        id
      ),
    duration
  );

  return message.delete()
    .catch(() => {});
}

async function finishGiveaway(
  guild,
  id
) {
  const data =
    guildDB(
      guild.id
    );

  const giveaway =
    data.giveaways[id];

  if (
    !giveaway ||
    giveaway.ended
  ) {
    return;
  }

  giveaway.ended =
    true;

  const channel =
    guild.channels.cache.get(
      giveaway.channelId
    );

  const participants =
    Array.from(
      new Set(
        giveaway.participants ||
          []
      )
    );

  const shuffled =
    participants.sort(
      () => Math.random() - 0.5
    );

  const winners =
    shuffled.slice(
      0,
      Math.min(
        giveaway.winners,
        shuffled.length
      )
    );

  saveDB();

  if (
    channel?.isTextBased()
  ) {
    const text =
      winners.length
        ? winners
            .map(
              id =>
                `<@${id}>`
            )
            .join(", ")
        : "No hubo participantes.";

    await channel.send({
      embeds: [
        yellowEmbed(
          "🏆 SORTEO FINALIZADO",
          `🎁 Premio: **${giveaway.prize}**\n\n` +
          `🏆 Ganador(es): ${text}\n\n` +
          `👥 Participantes: **${participants.length}**\n\n` +
          `💛 Gracias por participar en **Nisk Studio**.`
        )
      ]
    });

    await sendLog(
      guild,
      data.channels.giveawayLogs,
      yellowEmbed(
        "🎉 Sorteo finalizado",
        `🎁 Premio: **${giveaway.prize}**\n` +
        `🏆 Ganadores: ${text}\n` +
        `👥 Participantes: **${participants.length}**`
      )
    );
  }

  try {
    if (
      channel &&
      giveaway.messageId
    ) {
      const message =
        await channel.messages.fetch(
          giveaway.messageId
        );

      await message.edit({
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `giveaway_finished_${id}`
              )
              .setLabel(
                "Sorteo finalizado"
              )
              .setEmoji("🔒")
              .setStyle(
                ButtonStyle.Secondary
              )
              .setDisabled(true)
          )
        ]
      });
    }
  } catch {}
}

/* =========================================================
   INTERACCIONES DISCORD
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    if (!interaction.guild) return;

    const data =
      guildDB(
        interaction.guild.id
      );

    /* =====================================================
       HELP MENU
    ===================================================== */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "help_menu"
    ) {
      const selected =
        interaction.values[0];

      const sections = {
        economy: [
          "💰 Economía",
          `\`/balance\` — Ver Coins Nisk.\n` +
          `\`/work\` — Trabajar y ganar Coins Nisk.\n` +
          `\`/luck\` — Probar suerte gratis.\n` +
          `\`/shop\` — Ver la tienda.\n` +
          `\`/inventory\` — Ver inventario.\n` +
          `\`/leaderboard\` — Ver el TOP de Coins Nisk.\n` +
          `\`/buy\` — Comprar un artículo.`
        ],

        levels: [
          "📈 Niveles",
          `\`/rank\` — Ver tu nivel y XP.\n\n` +
          `💬 Ganas XP participando en el servidor.\n` +
          `🏆 Los niveles pueden entregar roles configurados por la administración.`
        ],

        fun: [
          "🍀 Diversión",
          `\`/luck\` — Juego gratuito de suerte.\n` +
          `\`n.sorteo\` — Sorteos creados por el Staff autorizado.`
        ],

        interaction: [
          "🤝 Interacción",
          `\`/hug\` — Dar un abrazo.\n` +
          `\`/highfive\` — Chocar los cinco.\n` +
          `\`/poke\` — Dar un toque.\n` +
          `\`/clap\` — Aplaudir.\n` +
          `\`/wave\` — Saludar.\n` +
          `\`/gift\` — Enviar un regalo simbólico.\n` +
          `\`/cookie\` — Dar una galleta.\n` +
          `\`/compliment\` — Dar un cumplido.\n` +
          `\`/laugh\` — Reírse con alguien.\n` +
          `\`/challenge\` — Retar a alguien.`
        ],

        utility: [
          "👤 Utilidades",
          `\`/rank\` — Consultar nivel.\n` +
          `\`/balance\` — Consultar Coins Nisk.\n` +
          `\`/inventory\` — Consultar inventario.\n` +
          `\`/shop\` — Consultar tienda.\n` +
          `\`/leaderboard\` — Consultar clasificación.`
        ],

        info: [
          "ℹ️ Información",
          `💛 **Nisk Studio | Programación**\n\n` +
          `Una comunidad para programación, bots, juegos, proyectos y conversación.\n\n` +
          `Utiliza los canales correspondientes y respeta las reglas de la comunidad.`
        ]
      };

      const section =
        sections[selected];

      return interaction.reply({
        embeds: [
          yellowEmbed(
            section[0],
            section[1]
          )
        ],
        ephemeral: true
      });
    }

    /* =====================================================
       ADMIN MENU
    ===================================================== */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "admin_menu"
    ) {
      if (
        !isAdmin(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "⛔ Solo los administradores pueden utilizar este menú.",
          ephemeral: true
        });
      }

      const selected =
        interaction.values[0];

      const sections = {
        tickets: [
          "🎫 Tickets",
          `📂 Categoría principal: ${
            data.ticketCategory
              ? `<#${data.ticketCategory}>`
              : "No configurada"
          }\n\n` +
          `🎟️ Tipos configurados: **${Object.keys(data.ticketTypes).length}**\n\n` +
          `Puedes gestionar las categorías mediante \`/addcategory\` y \`/removecategory\`.`
        ],

        levels: [
          "📈 Niveles",
          `Sistema: **${
            data.settings.levels.enabled
              ? "Activado"
              : "Desactivado"
          }**\n` +
          `📢 Canal: ${
            data.settings.levels.channel
              ? `<#${data.settings.levels.channel}>`
              : "Canal donde se obtiene XP"
          }\n` +
          `✨ XP por mensaje: ${data.settings.levels.xpMin}-${data.settings.levels.xpMax}\n` +
          `⏱️ Cooldown: ${formatTime(data.settings.levels.cooldown)}\n` +
          `🏆 Recompensas configuradas: **${Object.keys(data.settings.levels.roleRewards).length}**`
        ],

        logs: [
          "📋 Logs",
          `📋 General: ${
            data.channels.generalLogs
              ? `<#${data.channels.generalLogs}>`
              : "No configurado"
          }\n` +
          `🛡️ Moderación: ${
            data.channels.moderationLogs
              ? `<#${data.channels.moderationLogs}>`
              : "No configurado"
          }\n` +
          `🎫 Tickets: ${
            data.channels.ticketLogs
              ? `<#${data.channels.ticketLogs}>`
              : "No configurado"
          }\n` +
          `💳 Transacciones: ${
            data.channels.transactionLogs
              ? `<#${data.channels.transactionLogs}>`
              : "No configurado"
          }\n` +
          `📈 Niveles: ${
            data.channels.levelLogs
              ? `<#${data.channels.levelLogs}>`
              : "No configurado"
          }\n` +
          `🎉 Sorteos: ${
            data.channels.giveawayLogs
              ? `<#${data.channels.giveawayLogs}>`
              : "No configurado"
          }`
        ],

        welcome: [
          "👋 Bienvenida",
          `Canal actual: ${
            data.channels.welcome
              ? `<#${data.channels.welcome}>`
              : "No configurado"
          }`
        ],

        invites: [
          "🔗 Invitaciones",
          `Canal actual: ${
            data.channels.invites
              ? `<#${data.channels.invites}>`
              : "No configurado"
          }\n\n` +
          `El sistema registra invitados activos y miembros que posteriormente abandonan el servidor.`
        ],

        autoroles: [
          "🎭 Autoroles",
          data.autoroles.length
            ? data.autoroles
                .map(
                  id =>
                    `• <@&${id}>`
                )
                .join("\n")
            : "No hay autoroles configurados."
        ],

        economy: [
          "💰 Economía",
          `💰 Sistema de Coins Nisk activo.\n\n` +
          `💼 Work: recompensa cada 30 segundos.\n` +
          `🍀 Luck: juego gratuito.\n` +
          `🛍️ Tienda: ${Object.keys(data.shop).length} artículos.\n` +
          `🏆 Leaderboard disponible.`
        ],

        giveaways: [
          "🎉 Sorteos",
          `🎉 Sorteos registrados: **${Object.keys(data.giveaways).length}**\n\n` +
          `Los sorteos utilizan participación mediante botón y seleccionan ganadores automáticamente al finalizar.`
        ],

        moderation: [
          "🛡️ Moderación",
          `El Staff autorizado puede utilizar:\n\n` +
          `🔨 Ban\n` +
          `👢 Kick\n` +
          `🔇 Timeout\n` +
          `🔊 Unmute\n` +
          `🧹 Purge\n` +
          `⚠️ Warn\n` +
          `🔒 Lock\n` +
          `🔓 Unlock\n` +
          `🐌 Slowmode`
        ],

        security: [
          "🍯 Seguridad",
          `Canal Honeypot: ${
            data.honeypot.channel
              ? `<#${data.honeypot.channel}>`
              : "No configurado"
          }\n\n` +
          `🔨 Bans registrados: **${data.honeypot.bans}**\n\n` +
          `⚠️ La configuración del Honeypot es exclusiva de administradores.`
        ],

        config: [
          "⚙️ Configuración",
          `🛡️ Staff: ${
            data.staffRole
              ? `<@&${data.staffRole}>`
              : "No configurado"
          }\n\n` +
          `⚙️ Configuración exclusiva de administradores.\n` +
          `👮 El Staff operativo no puede modificar estas opciones.`
        ]
      };

      const section =
        sections[selected];

      return interaction.reply({
        embeds: [
          yellowEmbed(
            section[0],
            section[1]
          )
        ],
        ephemeral: true
      });
    }

    /* =====================================================
       TICKET SELECT
    ===================================================== */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "ticket_type"
    ) {
      const typeKey =
        interaction.values[0];

      const type =
        data.ticketTypes[
          typeKey
        ];

      if (!type) {
        return interaction.reply({
          content:
            "❌ Esa categoría ya no existe.",
          ephemeral: true
        });
      }

      const questions =
        type.questions || [
          "¿En qué te podemos ayudar?"
        ];

      const modal =
        new ModalBuilder()
          .setCustomId(
            `ticket_modal_${typeKey}`
          )
          .setTitle(
            type.name.slice(
              0,
              45
            )
          );

      questions
        .slice(0, 5)
        .forEach(
          (
            question,
            index
          ) => {
            const input =
              new TextInputBuilder()
                .setCustomId(
                  `question_${index}`
                )
                .setLabel(
                  question.slice(
                    0,
                    45
                  )
                )
                .setStyle(
                  TextInputStyle.Paragraph
                )
                .setRequired(
                  true
                )
                .setPlaceholder(
                  "Escribe tu respuesta aquí..."
                );

            modal.addComponents(
              new ActionRowBuilder().addComponents(
                input
              )
            );
          }
        );

      return interaction.showModal(
        modal
      );
    }

    /* =====================================================
       TICKET MODAL
    ===================================================== */

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith(
        "ticket_modal_"
      )
    ) {
      const typeKey =
        interaction.customId.replace(
          "ticket_modal_",
          ""
        );

      const type =
        data.ticketTypes[
          typeKey
        ];

      if (!type) {
        return interaction.reply({
          content:
            "❌ Categoría no encontrada.",
          ephemeral: true
        });
      }

      const existing =
        Object.values(
          data.tickets
        ).find(
          ticket =>
            ticket.userId ===
              interaction.user.id &&
            !ticket.closed
        );

      if (existing) {
        return interaction.reply({
          content:
            `❌ Ya tienes un ticket abierto: <#${existing.channelId}>`,
          ephemeral: true
        });
      }

      const parent =
        data.ticketCategory &&
        interaction.guild.channels.cache.get(
          data.ticketCategory
        );

      const channel =
        await interaction.guild.channels.create(
          {
            name:
              `ticket-${cleanName(
                interaction.user.username
              )}`,
            type:
              ChannelType.GuildText,
            parent:
              parent?.type ===
              ChannelType.GuildCategory
                ? parent.id
                : undefined,

            permissionOverwrites: [
              {
                id:
                  interaction.guild
                    .roles.everyone.id,
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
                  PermissionFlagsBits.AttachFiles
                ]
              }
            ]
          }
        );

      if (data.staffRole) {
        await channel.permissionOverwrites.edit(
          data.staffRole,
          {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
          }
        );
      }

      const answers = [];

      for (
        let i = 0;
        i <
        (
          type.questions ||
          []
        ).length;
        i++
      ) {
        const answer =
          interaction.fields.getTextInputValue(
            `question_${i}`
          );

        answers.push(
          `**${type.questions[i]}**\n${answer}`
        );
      }

      const ticketId =
        `${Date.now()}_${interaction.user.id}`;

      data.tickets[
        ticketId
      ] = {
        channelId:
          channel.id,
        userId:
          interaction.user.id,
        type:
          typeKey,
        claimedBy: null,
        closed: false,
        createdAt:
          Date.now(),
        rating: null
      };

      saveDB();

      const buttons =
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                "ticket_claim"
              )
              .setLabel(
                "Reclamar"
              )
              .setEmoji(
                "🙋"
              )
              .setStyle(
                ButtonStyle.Primary
              ),

            new ButtonBuilder()
              .setCustomId(
                "ticket_close"
              )
              .setLabel(
                "Cerrar ticket"
              )
              .setEmoji(
                "🔒"
              )
              .setStyle(
                ButtonStyle.Danger
              )
          );

      await channel.send({
        content:
          `<@${interaction.user.id}>`,
        embeds: [
          yellowEmbed(
            `╭・✦・──────────────・✦・╮\n             🎫 ${type.name.toUpperCase()}\n╰・✦・──────────────・✦・╯`,
            `👋 ¡Hola <@${interaction.user.id}>!\n\n` +
            `Tu ticket ha sido creado correctamente.\n\n` +
            `📌 **Categoría:** ${type.name}\n` +
            `🆔 **ID:** \`${ticketId}\`\n` +
            `👮 **Staff:** ${
              data.staffRole
                ? `<@&${data.staffRole}>`
                : "Staff autorizado"
            }\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +
            answers.join(
              "\n\n"
            ) +
            `\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
            `💛 Gracias por contactar con **Nisk Studio**.\n\n` +
            `🔒 Cuando hayas terminado, utiliza el botón de cerrar.`
          )
        ],
        components: [
          buttons
        ]
      });

      await interaction.reply({
        content:
          `✅ Tu ticket ha sido creado: ${channel}`,
        ephemeral: true
      });

      await sendLog(
        interaction.guild,
        data.channels.ticketLogs,
        yellowEmbed(
          "🎫 Ticket creado",
          `👤 Usuario: ${interaction.user}\n` +
          `📂 Categoría: **${type.name}**\n` +
          `📌 Canal: ${channel}\n` +
          `🆔 ID: \`${ticketId}\``
        )
      );

      return;
    }

    /* =====================================================
       TICKET CLAIM
    ===================================================== */

    if (
      interaction.isButton() &&
      interaction.customId ===
        "ticket_claim"
    ) {
      if (
        !isStaff(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "⛔ Solo el Staff autorizado puede reclamar tickets.",
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
            "❌ Este canal no está registrado como ticket.",
          ephemeral: true
        });
      }

      if (
        ticket.claimedBy
      ) {
        return interaction.reply({
          content:
            `❌ Este ticket ya fue reclamado por <@${ticket.claimedBy}>.`,
          ephemeral: true
        });
      }

      ticket.claimedBy =
        interaction.user.id;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🙋 Ticket reclamado",
            `👮 Este ticket ha sido reclamado por ${interaction.user}.\n\n` +
            `El miembro del Staff se encargará de atender la solicitud.`
          )
        ]
      });
    }

    /* =====================================================
       TICKET CLOSE
    ===================================================== */

    if (
      interaction.isButton() &&
      interaction.customId ===
        "ticket_close"
    ) {
      const ticket =
        ticketRecordByChannel(
          interaction.guild.id,
          interaction.channel.id
        );

      if (!ticket) {
        return interaction.reply({
          content:
            "❌ Este canal no es un ticket.",
          ephemeral: true
        });
      }

      if (
        interaction.user.id !==
          ticket.userId &&
        !isStaff(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "⛔ No tienes permiso para cerrar este ticket.",
          ephemeral: true
        });
      }

      ticket.closed = true;

      saveDB();

      const ratingRow =
        new ActionRowBuilder();

      for (
        let i = 1;
        i <= 5;
        i++
      ) {
        ratingRow.addComponents(
          new ButtonBuilder()
            .setCustomId(
              `ticket_rate_${i}_${ticket.userId}`
            )
            .setLabel(
              `${i} ⭐`
            )
            .setStyle(
              ButtonStyle.Secondary
            )
        );
      }

      await interaction.reply({
        embeds: [
          yellowEmbed(
            "🔒 Ticket cerrado",
            `Este ticket ha sido cerrado correctamente.\n\n` +
            `⭐ Si deseas valorar la atención recibida, selecciona una puntuación del **1 al 5**.\n\n` +
            `El canal será eliminado próximamente.`
          )
        ],
        components: [
          ratingRow
        ]
      });

      await sendLog(
        interaction.guild,
        data.channels.ticketLogs,
        yellowEmbed(
          "🔒 Ticket cerrado",
          `👤 Usuario: <@${ticket.userId}>\n` +
          `👮 Cerrado por: ${interaction.user}\n` +
          `📌 Canal: ${interaction.channel.name}`
        )
      );

      setTimeout(
        async () => {
          try {
            await interaction.channel.delete();
          } catch {}
        },
        60000
      );

      return;
    }

    /* =====================================================
       TICKET RATING
    ===================================================== */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        "ticket_rate_"
      )
    ) {
      const parts =
        interaction.customId.split(
          "_"
        );

      const rating =
        Number(parts[2]);

      const userId =
        parts[3];

      if (
        interaction.user.id !==
        userId
      ) {
        return interaction.reply({
          content:
            "⛔ Solo el creador del ticket puede realizar esta valoración.",
          ephemeral: true
        });
      }

      const ticket =
        ticketRecordByChannel(
          interaction.guild.id,
          interaction.channel.id
        );

      if (ticket) {
        ticket.rating =
          rating;

        saveDB();
      }

      await interaction.reply({
        content:
          `⭐ Gracias por valorar la atención con **${rating}/5**.`,
        ephemeral: true
      });

      await sendLog(
        interaction.guild,
        data.channels.ticketLogs,
        yellowEmbed(
          "⭐ Valoración de ticket",
          `👤 Usuario: <@${userId}>\n` +
          `⭐ Valoración: **${rating}/5**\n` +
          `📌 Ticket: ${interaction.channel}`
        )
      );

      return;
    }

    /* =====================================================
       GIVEAWAY JOIN
    ===================================================== */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        "giveaway_join_"
      )
    ) {
      const id =
        interaction.customId.replace(
          "giveaway_join_",
          ""
        );

      const giveaway =
        data.giveaways[id];

      if (
        !giveaway ||
        giveaway.ended
      ) {
        return interaction.reply({
          content:
            "❌ Este sorteo ya terminó.",
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
            "ℹ️ Ya estás participando en este sorteo.",
          ephemeral: true
        });
      }

      giveaway.participants.push(
        interaction.user.id
      );

      saveDB();

      return interaction.reply({
        content:
          "🎉 ¡Has entrado al sorteo correctamente!",
        ephemeral: true
      });
    }

    /* =====================================================
       MODAL: CONFIGURACIÓN DE NIVELES
    ===================================================== */

    if (
      interaction.isModalSubmit() &&
      interaction.customId ===
        "levels_config_modal"
    ) {
      if (
        !isAdmin(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "⛔ Solo administradores.",
          ephemeral: true
        });
      }

      const data =
        guildDB(
          interaction.guild.id
        );

      const min =
        Number(
          interaction.fields.getTextInputValue(
            "xp_min"
          )
        );

      const max =
        Number(
          interaction.fields.getTextInputValue(
            "xp_max"
          )
        );

      const cooldown =
        Number(
          interaction.fields.getTextInputValue(
            "cooldown"
          )
        );

      const message =
        interaction.fields.getTextInputValue(
          "level_message"
        );

      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < 1 ||
        max < min ||
        !Number.isInteger(
          cooldown
        ) ||
        cooldown < 1
      ) {
        return interaction.reply({
          content:
            "❌ Los valores de XP o cooldown no son válidos.",
          ephemeral: true
        });
      }

      data.settings.levels.xpMin =
        min;

      data.settings.levels.xpMax =
        max;

      data.settings.levels.cooldown =
        cooldown * 1000;

      data.settings.levels.message =
        message ||
        "🎉 {usuario} ha subido al nivel **{nivel}**.";

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "📈 Niveles configurados",
            `✨ XP: **${min}-${max}**\n` +
            `⏱️ Cooldown: **${cooldown}s**\n\n` +
            `📝 Mensaje actualizado correctamente.`
          )
        ],
        ephemeral: true
      });
    }
  }
);

/* =========================================================
   SLASH COMMANDS
========================================================= */

const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription(
      "Ver los comandos del bot"
    ),

  new SlashCommandBuilder()
    .setName("admin")
    .setDescription(
      "Configurar y administrar Nisk Studio"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("staffrole")
    .setDescription(
      "Configurar el rol de Staff"
    )
    .addRoleOption(
      option =>
        option
          .setName("rol")
          .setDescription(
            "Rol de Staff"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("honeypot")
    .setDescription(
      "Configurar el canal Honeypot"
    )
    .addChannelOption(
      option =>
        option
          .setName("canal")
          .setDescription(
            "Canal Honeypot"
          )
          .setRequired(true)
          .addChannelTypes(
            ChannelType.GuildText
          )
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("honeypot-disable")
    .setDescription(
      "Desactivar el Honeypot"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("addcategory")
    .setDescription(
      "Crear una categoría de tickets"
    )
    .addStringOption(
      option =>
        option
          .setName("nombre")
          .setDescription(
            "Nombre"
          )
          .setRequired(true)
    )
    .addStringOption(
      option =>
        option
          .setName("preguntas")
          .setDescription(
            "Preguntas separadas por |"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("removecategory")
    .setDescription(
      "Eliminar una categoría"
    )
    .addStringOption(
      option =>
        option
          .setName("nombre")
          .setDescription(
            "Categoría"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("ticketcategory")
    .setDescription(
      "Configurar categoría de Discord para tickets"
    )
    .addChannelOption(
      option =>
        option
          .setName("categoria")
          .setDescription(
            "Categoría de Discord"
          )
          .setRequired(true)
          .addChannelTypes(
            ChannelType.GuildCategory
          )
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("ticketpanel")
    .setDescription(
      "Enviar el panel de tickets"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("welcome")
    .setDescription(
      "Configurar bienvenida"
    )
    .addChannelOption(
      option =>
        option
          .setName("canal")
          .setDescription(
            "Canal"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("invite")
    .setDescription(
      "Configurar canal de invitaciones"
    )
    .addChannelOption(
      option =>
        option
          .setName("canal")
          .setDescription(
            "Canal"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("invitescheck")
    .setDescription(
      "Consultar invitaciones"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("autorole")
    .setDescription(
      "Añadir un autorol"
    )
    .addRoleOption(
      option =>
        option
          .setName("rol")
          .setDescription(
            "Rol"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("autorole-remove")
    .setDescription(
      "Eliminar un autorol"
    )
    .addRoleOption(
      option =>
        option
          .setName("rol")
          .setDescription(
            "Rol"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("logs")
    .setDescription(
      "Configurar un canal de logs"
    )
    .addStringOption(
      option =>
        option
          .setName("tipo")
          .setDescription(
            "Tipo de log"
          )
          .setRequired(true)
          .addChoices(
            {
              name: "General",
              value: "generalLogs"
            },
            {
              name: "Moderación",
              value: "moderationLogs"
            },
            {
              name: "Tickets",
              value: "ticketLogs"
            },
            {
              name: "Transacciones",
              value: "transactionLogs"
            },
            {
              name: "Niveles",
              value: "levelLogs"
            },
            {
              name: "Sorteos",
              value: "giveawayLogs"
            }
          )
    )
    .addChannelOption(
      option =>
        option
          .setName("canal")
          .setDescription(
            "Canal"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("levels")
    .setDescription(
      "Activar o desactivar niveles"
    )
    .addBooleanOption(
      option =>
        option
          .setName("activo")
          .setDescription(
            "Activado"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("levelchannel")
    .setDescription(
      "Configurar canal de niveles"
    )
    .addChannelOption(
      option =>
        option
          .setName("canal")
          .setDescription(
            "Canal"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("levelconfig")
    .setDescription(
      "Configurar XP y mensajes de niveles"
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("levelrole")
    .setDescription(
      "Asignar un rol a un nivel"
    )
    .addIntegerOption(
      option =>
        option
          .setName("nivel")
          .setDescription(
            "Nivel"
          )
          .setRequired(true)
          .setMinValue(1)
    )
    .addRoleOption(
      option =>
        option
          .setName("rol")
          .setDescription(
            "Rol"
          )
          .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription(
      "Banear un miembro"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription(
      "Expulsar un miembro"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription(
      "Aplicar timeout"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    )
    .addIntegerOption(
      option =>
        option
          .setName("minutos")
          .setDescription(
            "Duración"
          )
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(40320)
    ),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription(
      "Quitar timeout"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription(
      "Eliminar mensajes"
    )
    .addIntegerOption(
      option =>
        option
          .setName("cantidad")
          .setDescription(
            "Cantidad"
          )
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription(
      "Advertir a un miembro"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    )
    .addStringOption(
      option =>
        option
          .setName("razon")
          .setDescription(
            "Razón"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription(
      "Ver advertencias"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription(
      "Bloquear el canal"
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription(
      "Desbloquear el canal"
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription(
      "Configurar slowmode"
    )
    .addIntegerOption(
      option =>
        option
          .setName("segundos")
          .setDescription(
            "0-21600"
          )
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(21600)
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription(
      "Ver Coins Nisk"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("work")
    .setDescription(
      "Trabajar y ganar Coins Nisk"
    ),

  new SlashCommandBuilder()
    .setName("luck")
    .setDescription(
      "Probar suerte gratis"
    ),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription(
      "Ver la tienda"
    ),

  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription(
      "Ver tu inventario"
    ),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription(
      "Comprar un artículo"
    )
    .addStringOption(
      option =>
        option
          .setName("articulo")
          .setDescription(
            "ID del artículo"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription(
      "Ver el TOP de Coins Nisk"
    ),

  new SlashCommandBuilder()
    .setName("sorteo")
    .setDescription(
      "Crear un sorteo"
    )
    .addStringOption(
      option =>
        option
          .setName("duracion")
          .setDescription(
            "Ejemplo: 30m, 1h, 2d"
          )
          .setRequired(true)
    )
    .addIntegerOption(
      option =>
        option
          .setName("ganadores")
          .setDescription(
            "Cantidad de ganadores"
          )
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(20)
    )
    .addStringOption(
      option =>
        option
          .setName("premio")
          .setDescription(
            "Premio del sorteo"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription(
      "Ver tu nivel"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("hug")
    .setDescription(
      "Dar un abrazo"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("highfive")
    .setDescription(
      "Chocar los cinco"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("poke")
    .setDescription(
      "Dar un toque"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clap")
    .setDescription(
      "Aplaudir"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("wave")
    .setDescription(
      "Saludar"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("gift")
    .setDescription(
      "Enviar un regalo simbólico"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("cookie")
    .setDescription(
      "Dar una galleta"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("compliment")
    .setDescription(
      "Dar un cumplido"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("laugh")
    .setDescription(
      "Reírse con alguien"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("challenge")
    .setDescription(
      "Retar a alguien"
    )
    .addUserOption(
      option =>
        option
          .setName("usuario")
          .setDescription(
            "Usuario"
          )
          .setRequired(true)
    )
].map(
  command =>
    command.toJSON()
);

/* =========================================================
   SLASH HANDLER
========================================================= */

client.on(
  "interactionCreate",
  async interaction => {
    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    if (!interaction.guild) {
      return;
    }

    const data =
      guildDB(
        interaction.guild.id
      );

    const adminOnly = [
      "admin",
      "staffrole",
      "honeypot",
      "honeypot-disable",
      "addcategory",
      "removecategory",
      "ticketcategory",
      "ticketpanel",
      "welcome",
      "invite",
      "autorole",
      "autorole-remove",
      "logs",
      "levels",
      "levelchannel",
      "levelconfig",
      "levelrole"
    ];

    if (
      adminOnly.includes(
        interaction.commandName
      ) &&
      !isAdmin(
        interaction.member
      )
    ) {
      return interaction.reply({
        content:
          "⛔ Esta configuración es exclusiva para administradores.",
        ephemeral: true
      });
    }

    /* HELP */

    if (
      interaction.commandName ===
      "help"
    ) {
      return sendHelp(
        interaction,
        true
      );
    }

    /* ADMIN */

    if (
      interaction.commandName ===
      "admin"
    ) {
      return sendAdminMenu(
        interaction,
        true
      );
    }

    /* STAFF ROLE */

    if (
      interaction.commandName ===
      "staffrole"
    ) {
      const role =
        interaction.options.getRole(
          "rol"
        );

      data.staffRole =
        role.id;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🛡️ Staff configurado",
            `El rol de Staff ahora es ${role}.\n\n` +
            `🛡️ El Staff puede realizar funciones operativas.\n` +
            `🔐 La configuración del bot continúa siendo exclusiva de administradores.`
          )
        ],
        ephemeral: true
      });
    }

    /* HONEYPOT */

    if (
      interaction.commandName ===
      "honeypot"
    ) {
      const channel =
        interaction.options.getChannel(
          "canal"
        );

      data.honeypot.channel =
        channel.id;

      const embed =
        yellowEmbed(
          "╭・✦・──────────────・✦・╮\n             🍯 HONEYPOT\n╰・✦・──────────────・✦・╯",
          `⛔ **NO ESCRIBAS EN ESTE CANAL**\n\n` +
          `Este canal está protegido por el sistema de seguridad de **Nisk Studio**.\n\n` +
          `Las cuentas que escriban aquí podrán ser detectadas automáticamente.\n\n` +
          `⚠️ Las cuentas administrativas quedan excluidas del sistema.`
        );

      const button =
        new ButtonBuilder()
          .setCustomId(
            "honeypot_counter"
          )
          .setLabel(
            `Ban: ${data.honeypot.bans}`
          )
          .setEmoji("🔨")
          .setStyle(
            ButtonStyle.Secondary
          )
          .setDisabled(true);

      const sent =
        await channel.send({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              button
            )
          ]
        });

      data.honeypot.messageId =
        sent.id;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🍯 Honeypot configurado",
            `El Honeypot ahora está activo en ${channel}.\n\n` +
            `🔨 Bans registrados: **${data.honeypot.bans}**`
          )
        ],
        ephemeral: true
      });
    }

    if (
      interaction.commandName ===
      "honeypot-disable"
    ) {
      data.honeypot.channel =
        null;

      data.honeypot.messageId =
        null;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🍯 Honeypot desactivado",
            "El sistema Honeypot ha sido desactivado correctamente."
          )
        ],
        ephemeral: true
      });
    }

    /* CATEGORÍA DE TICKETS */

    if (
      interaction.commandName ===
      "ticketcategory"
    ) {
      const category =
        interaction.options.getChannel(
          "categoria"
        );

      data.ticketCategory =
        category.id;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🎫 Categoría de tickets",
            `Los nuevos tickets se crearán dentro de ${category}.`
          )
        ],
        ephemeral: true
      });
    }

    /* ADD CATEGORY */

    if (
      interaction.commandName ===
      "addcategory"
    ) {
      const name =
        interaction.options.getString(
          "nombre"
        );

      const questions =
        interaction.options
          .getString(
            "preguntas"
          )
          .split("|")
          .map(
            x => x.trim()
          )
          .filter(Boolean)
          .slice(0, 5);

      const key =
        cleanName(name);

      data.ticketTypes[key] = {
        name,
        questions
      };

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🎫 Categoría creada",
            `📂 **${name}**\n\n` +
            `Preguntas configuradas:\n` +
            questions
              .map(
                (q, i) =>
                  `**${i + 1}.** ${q}`
              )
              .join("\n")
          )
        ]
      });
    }

    /* REMOVE CATEGORY */

    if (
      interaction.commandName ===
      "removecategory"
    ) {
      const name =
        interaction.options.getString(
          "nombre"
        );

      const key =
        cleanName(name);

      if (
        !data.ticketTypes[key]
      ) {
        return interaction.reply({
          content:
            "❌ Esa categoría no existe.",
          ephemeral: true
        });
      }

      delete data.ticketTypes[
        key
      ];

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🗑️ Categoría eliminada",
            `La categoría **${name}** ha sido eliminada.`
          )
        ]
      });
    }

    /* TICKET PANEL */

    if (
      interaction.commandName ===
      "ticketpanel"
    ) {
      return sendTicketPanel(
        null,
        data,
        interaction
      );
    }

    /* WELCOME */

    if (
      interaction.commandName ===
      "welcome"
    ) {
      const channel =
        interaction.options.getChannel(
          "canal"
        );

      data.channels.welcome =
        channel.id;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "👋 Bienvenida configurada",
            `El canal de bienvenida será ${channel}.`
          )
        ],
        ephemeral: true
      });
    }

    /* INVITE */

    if (
      interaction.commandName ===
      "invite"
    ) {
      const channel =
        interaction.options.getChannel(
          "canal"
        );

      data.channels.invites =
        channel.id;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🔗 Invitaciones configuradas",
            `Las invitaciones se anunciarán en ${channel}.`
          )
        ],
        ephemeral: true
      });
    }

    /* INVITES CHECK */

    if (
      interaction.commandName ===
      "invitescheck"
    ) {
      if (
        !isStaff(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "⛔ No tienes permisos.",
          ephemeral: true
        });
      }

      const user =
        interaction.options.getUser(
          "usuario"
        ) ||
        interaction.user;

      const inviteData =
        data.invites.users[
          user.id
        ] || {
          total: 0,
          active: 0,
          left: 0
        };

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🔗 Estadísticas de invitaciones",
            `👤 Usuario: ${user}\n\n` +
            `👥 Miembros invitados: **${inviteData.total}**\n` +
            `🟢 Actualmente en el servidor: **${inviteData.active}**\n` +
            `🔴 Invitados que se fueron: **${inviteData.left}**\n` +
            `📊 Total registrado: **${inviteData.total}**`
          )
        ]
      });
    }

    /* AUTOROLE */

    if (
      interaction.commandName ===
      "autorole"
    ) {
      const role =
        interaction.options.getRole(
          "rol"
        );

      if (
        !data.autoroles.includes(
          role.id
        )
      ) {
        data.autoroles.push(
          role.id
        );
      }

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🎭 Autorol añadido",
            `Los nuevos miembros recibirán automáticamente ${role}.`
          )
        ]
      });
    }

    if (
      interaction.commandName ===
      "autorole-remove"
    ) {
      const role =
        interaction.options.getRole(
          "rol"
        );

      data.autoroles =
        data.autoroles.filter(
          id =>
            id !== role.id
        );

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🗑️ Autorol eliminado",
            `${role} ya no se asignará automáticamente.`
          )
        ]
      });
    }

    /* LOGS */

    if (
      interaction.commandName ===
      "logs"
    ) {
      const type =
        interaction.options.getString(
          "tipo"
        );

      const channel =
        interaction.options.getChannel(
          "canal"
        );

      data.channels[type] =
        channel.id;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "📋 Logs configurados",
            `El canal ${channel} ha sido configurado para **${type}**.`
          )
        ],
        ephemeral: true
      });
    }

    /* LEVELS */

    if (
      interaction.commandName ===
      "levels"
    ) {
      const enabled =
        interaction.options.getBoolean(
          "activo"
        );

      data.settings.levels.enabled =
        enabled;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "📈 Niveles actualizados",
            `El sistema de niveles está ahora **${enabled ? "ACTIVADO" : "DESACTIVADO"}**.`
          )
        ],
        ephemeral: true
      });
    }

    if (
      interaction.commandName ===
      "levelchannel"
    ) {
      const channel =
        interaction.options.getChannel(
          "canal"
        );

      data.settings.levels.channel =
        channel.id;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "📈 Canal de niveles",
            `Los mensajes de subida de nivel se enviarán en ${channel}.`
          )
        ],
        ephemeral: true
      });
    }

    if (
      interaction.commandName ===
      "levelconfig"
    ) {
      const modal =
        new ModalBuilder()
          .setCustomId(
            "levels_config_modal"
          )
          .setTitle(
            "Configuración de niveles"
          );

      const min =
        new TextInputBuilder()
          .setCustomId(
            "xp_min"
          )
          .setLabel(
            "XP mínima"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setValue(
            String(
              data.settings.levels.xpMin
            )
          )
          .setRequired(true);

      const max =
        new TextInputBuilder()
          .setCustomId(
            "xp_max"
          )
          .setLabel(
            "XP máxima"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setValue(
            String(
              data.settings.levels.xpMax
            )
          )
          .setRequired(true);

      const cooldown =
        new TextInputBuilder()
          .setCustomId(
            "cooldown"
          )
          .setLabel(
            "Cooldown en segundos"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setValue(
            String(
              data.settings.levels.cooldown /
                1000
            )
          )
          .setRequired(true);

      const message =
        new TextInputBuilder()
          .setCustomId(
            "level_message"
          )
          .setLabel(
            "Mensaje de subida"
          )
          .setStyle(
            TextInputStyle.Paragraph
          )
          .setValue(
            data.settings.levels.message
          )
          .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          min
        ),
        new ActionRowBuilder().addComponents(
          max
        ),
        new ActionRowBuilder().addComponents(
          cooldown
        ),
        new ActionRowBuilder().addComponents(
          message
        )
      );

      return interaction.showModal(
        modal
      );
    }

    if (
      interaction.commandName ===
      "levelrole"
    ) {
      const level =
        interaction.options.getInteger(
          "nivel"
        );

      const role =
        interaction.options.getRole(
          "rol"
        );

      data.settings.levels.roleRewards[
        String(level)
      ] = role.id;

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🏆 Recompensa de nivel",
            `Cuando un usuario llegue al nivel **${level}**, recibirá ${role}.`
          )
        ],
        ephemeral: true
      });
    }

    /* =====================================================
       MODERACIÓN
    ===================================================== */

    const moderationCommands = [
      "ban",
      "kick",
      "mute",
      "unmute",
      "purge",
      "warn",
      "warnings",
      "lock",
      "unlock",
      "slowmode"
    ];

    if (
      moderationCommands.includes(
        interaction.commandName
      ) &&
      !isStaff(
        interaction.member
      )
    ) {
      return interaction.reply({
        content:
          "⛔ No tienes permisos de Staff.",
        ephemeral: true
      });
    }

    /* BAN */

    if (
      interaction.commandName ===
      "ban"
    ) {
      const user =
        interaction.options.getUser(
          "usuario"
        );

      const member =
        await interaction.guild.members
          .fetch(
            user.id
          )
          .catch(
            () => null
          );

      if (
        !member ||
        !member.bannable
      ) {
        return interaction.reply({
          content:
            "❌ No puedo banear a ese usuario.",
          ephemeral: true
        });
      }

      await member.ban({
        reason:
          `Ban realizado por ${interaction.user.tag}`
      });

      await sendLog(
        interaction.guild,
        data.channels.moderationLogs,
        yellowEmbed(
          "🔨 Usuario baneado",
          `👤 Usuario: **${user.tag}**\n` +
          `👮 Moderador: ${interaction.user}`
        )
      );

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🔨 Usuario baneado",
            `👤 Usuario: **${user.tag}**\n` +
            `👮 Moderador: ${interaction.user}`
          )
        ]
      });
    }

    /* KICK */

    if (
      interaction.commandName ===
      "kick"
    ) {
      const user =
        interaction.options.getUser(
          "usuario"
        );

      const member =
        await interaction.guild.members
          .fetch(
            user.id
          )
          .catch(
            () => null
          );

      if (
        !member ||
        !member.kickable
      ) {
        return interaction.reply({
          content:
            "❌ No puedo expulsar a ese usuario.",
          ephemeral: true
        });
      }

      await member.kick(
        `Kick realizado por ${interaction.user.tag}`
      );

      await sendLog(
        interaction.guild,
        data.channels.moderationLogs,
        yellowEmbed(
          "👢 Usuario expulsado",
          `👤 Usuario: **${user.tag}**\n` +
          `👮 Moderador: ${interaction.user}`
        )
      );

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "👢 Usuario expulsado",
            `👤 Usuario: **${user.tag}**`
          )
        ]
      });
    }

    /* MUTE */

    if (
      interaction.commandName ===
      "mute"
    ) {
      const user =
        interaction.options.getUser(
          "usuario"
        );

      const minutes =
        interaction.options.getInteger(
          "minutos"
        );

      const member =
        await interaction.guild.members
          .fetch(
            user.id
          )
          .catch(
            () => null
          );

      if (
        !member ||
        !member.moderatable
      ) {
        return interaction.reply({
          content:
            "❌ No puedo aplicar timeout.",
          ephemeral: true
        });
      }

      await member.timeout(
        minutes *
          60 *
          1000,
        `Timeout realizado por ${interaction.user.tag}`
      );

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🔇 Usuario silenciado",
            `👤 Usuario: **${user.tag}**\n` +
            `⏱️ Duración: **${minutes} minutos**\n` +
            `👮 Moderador: ${interaction.user}`
          )
        ]
      });
    }

    /* UNMUTE */

    if (
      interaction.commandName ===
      "unmute"
    ) {
      const user =
        interaction.options.getUser(
          "usuario"
        );

      const member =
        await interaction.guild.members
          .fetch(
            user.id
          )
          .catch(
            () => null
          );

      if (!member) {
        return interaction.reply({
          content:
            "❌ No encontré al miembro.",
          ephemeral: true
        });
      }

      await member.timeout(
        null
      );

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🔊 Timeout retirado",
            `👤 ${user}\n\n` +
            `El timeout ha sido retirado correctamente.`
          )
        ]
      });
    }

    /* PURGE */

    if (
      interaction.commandName ===
      "purge"
    ) {
      const amount =
        interaction.options.getInteger(
          "cantidad"
        );

      await interaction.channel.bulkDelete(
        amount,
        true
      );

      return interaction.reply({
        content:
          `🧹 Se eliminaron **${amount}** mensajes.`,
        ephemeral: true
      });
    }

    /* WARN */

    if (
      interaction.commandName ===
      "warn"
    ) {
      const user =
        interaction.options.getUser(
          "usuario"
        );

      const reason =
        interaction.options.getString(
          "razon"
        );

      data.warns[user.id] ||=
        [];

      data.warns[user.id].push({
        reason,
        moderator:
          interaction.user.id,
        date: Date.now()
      });

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "⚠️ Advertencia",
            `👤 Usuario: ${user}\n` +
            `📝 Razón: ${reason}\n` +
            `👮 Moderador: ${interaction.user}`
          )
        ]
      });
    }

    /* WARNINGS */

    if (
      interaction.commandName ===
      "warnings"
    ) {
      const user =
        interaction.options.getUser(
          "usuario"
        );

      const warns =
        data.warns[user.id] ||
        [];

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "📋 Advertencias",
            warns.length
              ? warns
                  .map(
                    (w, i) =>
                      `**${i + 1}.** ${w.reason}\n👮 <@${w.moderator}>`
                  )
                  .join(
                    "\n\n"
                  )
              : `${user} no tiene advertencias registradas.`
          )
        ]
      });
    }

    /* LOCK */

    if (
      interaction.commandName ===
      "lock"
    ) {
      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages:
            false
        }
      );

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🔒 Canal bloqueado",
            `El canal ha sido bloqueado por ${interaction.user}.`
          )
        ]
      });
    }

    /* UNLOCK */

    if (
      interaction.commandName ===
      "unlock"
    ) {
      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages:
            null
        }
      );

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🔓 Canal desbloqueado",
            `El canal vuelve a estar disponible.`
          )
        ]
      });
    }

    /* SLOWMODE */

    if (
      interaction.commandName ===
      "slowmode"
    ) {
      const seconds =
        interaction.options.getInteger(
          "segundos"
        );

      await interaction.channel.setRateLimitPerUser(
        seconds
      );

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "🐌 Slowmode",
            `El slowmode ahora es de **${seconds} segundos**.`
          )
        ]
      });
    }

    /* =====================================================
       ECONOMÍA
    ===================================================== */

    if (
      interaction.commandName ===
      "balance"
    ) {
      const user =
        interaction.options.getUser(
          "usuario"
        ) ||
        interaction.user;

      const account =
        getEconomyUser(
          interaction.guild.id,
          user.id
        );

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "💰 Coins Nisk",
            `👤 Usuario: ${user}\n\n` +
            `💰 Saldo: **${account.coins} Coins Nisk**`
          )
        ]
      });
    }

    if (
      interaction.commandName ===
      "work"
    ) {
      const account =
        getEconomyUser(
          interaction.guild.id,
          interaction.user.id
        );

      const cooldown =
        30000;

      const remaining =
        cooldown -
        (
          Date.now() -
          account.lastWork
        );

      if (
        remaining > 0
      ) {
        return interaction.reply({
          content:
            `💼 Debes esperar **${formatTime(remaining)}** para volver a trabajar.`,
          ephemeral: true
        });
      }

      const reward =
        Math.floor(
          Math.random() *
          201
        ) + 100;

      account.coins +=
        reward;

      account.lastWork =
        Date.now();

      saveDB();

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "💼 Trabajo completado",
            `💰 Has ganado **${reward} Coins Nisk**.\n\n` +
            `💳 Nuevo saldo: **${account.coins} Coins Nisk**`
          )
        ]
      });
    }

    if (
      interaction.commandName ===
      "luck"
    ) {
      return playLuck(
        interaction,
        true
      );
    }

    if (
      interaction.commandName ===
      "shop"
    ) {
      return sendShop(
        interaction,
        true
      );
    }

    if (
      interaction.commandName ===
      "inventory"
    ) {
      return sendInventory(
        interaction,
        true
      );
    }

    if (
      interaction.commandName ===
      "buy"
    ) {
      const item =
        interaction.options.getString(
          "articulo"
        );

      return buyShopItem(
        interaction,
        item,
        true
      );
    }

    if (
      interaction.commandName ===
      "leaderboard"
    ) {
      return sendLeaderboard(
        interaction,
        true
      );
    }

    /* SORTEO */

    if (
      interaction.commandName ===
      "sorteo"
    ) {
      if (
        !isStaff(
          interaction.member
        )
      ) {
        return interaction.reply({
          content:
            "⛔ Solo el Staff autorizado puede crear sorteos.",
          ephemeral: true
        });
      }

      const durationText =
        interaction.options.getString(
          "duracion"
        );

      const duration =
        parseDuration(
          durationText
        );

      const winners =
        interaction.options.getInteger(
          "ganadores"
        );

      const prize =
        interaction.options.getString(
          "premio"
        );

      if (!duration) {
        return interaction.reply({
          content:
            "❌ Duración inválida. Usa formatos como `30m`, `1h` o `2d`.",
          ephemeral: true
        });
      }

      return createGiveaway(
        interaction,
        duration,
        winners,
        prize
      );
    }

    /* RANK */

    if (
      interaction.commandName ===
      "rank"
    ) {
      const user =
        interaction.options.getUser(
          "usuario"
        ) ||
        interaction.user;

      const level =
        getLevelData(
          interaction.guild.id,
          user.id
        );

      return interaction.reply({
        embeds: [
          yellowEmbed(
            "📈 Perfil de nivel",
            `👤 ${user}\n\n` +
            `🏆 Nivel: **${level.level}**\n` +
            `✨ XP: **${level.xp}/${xpNeeded(level.level)}**`
          )
        ]
      });
    }

    /* =====================================================
       INTERACCIONES
    ===================================================== */

    const slashInteractions = {
      hug: [
        "🤗 ABRAZO",
        "le ha dado un gran abrazo a",
        "Parece que alguien necesitaba buena energía. ✨"
      ],

      highfive: [
        "🙌 HIGH FIVE",
        "le ha chocado los cinco a",
        "¡Esa energía se siente hasta aquí! ⚡"
      ],

      poke: [
        "👉 POKE",
        "ha dado un pequeño toque a",
        "¡Ey! ¿Qué está pasando por aquí? 👀"
      ],

      clap: [
        "👏 APLAUSO",
        "le ha dado un aplauso a",
        "¡Momento de reconocer el esfuerzo! ✨"
      ],

      wave: [
        "👋 SALUDO",
        "ha saludado a",
        "¡Qué bueno verte por Nisk Studio! 💛"
      ],

      gift: [
        "🎁 REGALO",
        "le ha enviado un regalo simbólico a",
        "¡Un pequeño detalle para alegrar el día! 🎀"
      ],

      cookie: [
        "🍪 GALLETA",
        "le ha dado una galleta a",
        "¡Una galletita nunca viene mal! 🍪"
      ],

      compliment: [
        "✨ CUMPLIDO",
        "le ha dejado un cumplido a",
        "¡Las buenas palabras siempre suman! 💛"
      ],

      laugh: [
        "😂 RISA",
        "se ha reído con",
        "¡La diversión continúa! 😂"
      ],

      challenge: [
        "⚔️ RETO",
        "ha retado a",
        "¡Que empiece el desafío! 🔥"
      ]
    };

    if (
      slashInteractions[
        interaction.commandName
      ]
    ) {
      const target =
        interaction.options.getUser(
          "usuario"
        );

      const info =
        slashInteractions[
          interaction.commandName
        ];

      return interaction.reply({
        embeds: [
          yellowEmbed(
            `╭・✦・──────────────・✦・╮\n             ${info[0]}\n╰・✦・──────────────・✦・╯`,
            `💛 ${interaction.user} ${info[1]} ${target}.\n\n` +
            `${info[2]}\n\n` +
            `🤝 **Nisk Studio | Interacciones**`
          )
        ]
      });
    }
  }
);

/* =========================================================
   REGISTRO DE SLASH COMMANDS
========================================================= */

async function registerCommands() {
  try {
    const rest =
      new REST({
        version: "10"
      }).setToken(
        TOKEN
      );

    console.log(
      "🔄 Registrando comandos..."
    );

    await rest.put(
      Routes.applicationCommands(
        client.user.id
      ),
      {
        body: commands
      }
    );

    console.log(
      `✅ ${commands.length} comandos registrados.`
    );
  } catch (error) {
    console.error(
      "❌ Error registrando comandos:",
      error
    );
  }
}

/* =========================================================
   ERRORES
========================================================= */

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "❌ Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "❌ Uncaught Exception:",
      error
    );
  }
);

/* =========================================================
   LOGIN
========================================================= */

client.login(TOKEN);
