const fs = require("fs");

global.owner = "6285956071065"
global.namaOwner = "Lynzz Official"
global.prefix = "."; // jangan di ubah
global.botName = "someone";
global.pairingNumber = "6287876816730"

// Setting Telegram
// Isi token dari @BotFather kalau ingin Telegram ikut jalan
global.telegramBotToken = "ISI_TOKEN_BOT_TELEGRAM"

global.enableOwnerDebug = false


// Runtime cache untuk metadata grup agar tidak error saat dipakai index.js/message.js
global.groupMetadataCache = global.groupMetadataCache || new Map();

global.mess = {
  owner: "Fitur ini hanya bisa digunakan oleh *Owner Bot*.",
  premium: "Fitur ini hanya bisa digunakan oleh *User Premium*.",
  group: "Fitur ini hanya dapat digunakan di dalam grup.",
  private: "Fitur ini hanya dapat digunakan di private chat.",
  admin: "Fitur ini hanya bisa digunakan oleh admin grup.",
  botadmin: "Fitur ini hanya dapat digunakan jika bot adalah admin grup.",
};

let file = require.resolve(__filename) 
fs.watchFile(file, () => {
fs.unwatchFile(file)
delete require.cache[file]
require(file)
})