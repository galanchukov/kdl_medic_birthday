// server/src/bot.js
require('dotenv').config();
const { Telegraf } = require('telegraf');
const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');

const prisma = new PrismaClient();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Функция расчета дней до ДР (из нашей логики app.js)
function daysUntilBirthday(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bd = new Date(dateStr + 'T00:00:00');
  let next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next - today) / 86400000);
}

// Команда /start
bot.start((ctx) => {
  ctx.reply('Привет! Я бот для отслеживания дней рождения врачей. Я буду присылать уведомления каждое утро.');
});

// Ручная проверка (для админа)
bot.command('check', async (ctx) => {
  const doctors = await prisma.doctor.findMany();
  const tomorrow = doctors.filter(d => daysUntilBirthday(d.birthday) === 1);
  const today = doctors.filter(d => daysUntilBirthday(d.birthday) === 0);

  if (!tomorrow.length && !today.length) {
    return ctx.reply('На сегодня и завтра именинников нет.');
  }

  let msg = '';
  if (today.length) {
    msg += '🎉 *Сегодня день рождения:*\n' + today.map(d => `• ${d.name} (${d.department})`).join('\n') + '\n\n';
  }
  if (tomorrow.length) {
    msg += '🎂 *Завтра день рождения:*\n' + tomorrow.map(d => `• ${d.name} (${d.department})`).join('\n');
  }

  ctx.replyWithMarkdown(msg);
});

// Ежедневная рассылка в 09:00
cron.schedule('0 9 * * *', async () => {
  console.log('Running daily birthday check...');
  const doctors = await prisma.doctor.findMany();
  const tomorrow = doctors.filter(d => daysUntilBirthday(d.birthday) === 1);
  
  if (tomorrow.length > 0) {
    const msg = '🎂 *Напоминание!*\nЗавтра день рождения у:\n' + 
                tomorrow.map(d => `• ${d.name} (${d.department})`).join('\n');
    
    // В реальном приложении тут нужно слать всем админам из базы
    const admins = await prisma.admin.findMany();
    for (const admin of admins) {
      try {
        await bot.telegram.sendMessage(Number(admin.telegramId), msg, { parse_mode: 'Markdown' });
      } catch (e) {
        console.error(`Failed to send message to ${admin.telegramId}`, e);
      }
    }
  }
});

bot.launch();
console.log('🤖 Telegram Bot started');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
