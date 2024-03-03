require('dotenv').config();
const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Инициализация базы данных
const db = new sqlite3.Database(':memory:'); // Используем базу данных в памяти для примера, но вы можете изменить это на файловую базу данных

// Создаем таблицу для хранения напоминаний
db.serialize(function () {
    db.run("CREATE TABLE reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, time INTEGER)");
});

// Функция для добавления напоминания в базу данных
async function addReminderToDB(event, time) {
    return new Promise((resolve, reject) => {
        db.run("INSERT INTO reminders (event, time) VALUES (?, ?)", [event, time], function (err) {
            if (err) {
                console.error(err);
                reject(err);
            } else {
                console.log(`Новое напоминание добавлено: ${event}`);
                resolve(this.lastID);
            }
        });
    });
}

// Функция для удаления напоминания из базы данных
async function removeReminderFromDB(id) {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM reminders WHERE id = ?", [id], function (err) {
            if (err) {
                console.error(err);
                reject(err);
            } else {
                console.log(`Напоминание с ID ${id} удалено.`);
                resolve();
            }
        });
    });
}

// Обработка команды !лист
bot.hears(/!лист/, async ctx => {
    try {
        db.all("SELECT * FROM reminders", function (err, rows) {
            if (err) {
                console.error(err);
                return;
            }

            if (rows.length === 0) {
                ctx.reply('Список напоминаний пуст.');
            } else {
                let reminderList = "Список напоминаний:\n";
                rows.forEach(row => {
                    const reminderDate = new Date(row.time);
                    const formattedDate = `${reminderDate.getDate()}.${reminderDate.getMonth() + 1}.${reminderDate.getFullYear()} ${reminderDate.getHours()}:${reminderDate.getMinutes().toString().padStart(2, '0')}`;
                    reminderList += `- ${row.event} (${formattedDate})\n`;
                });
                ctx.reply(reminderList);
            }
        });
    } catch (error) {
        console.log(error);
    }
});

// Обработка команды !удалить
bot.hears(/^!удалить\s+(.+)/, async ctx => {
    try {
        const eventToDelete = ctx.match[1]; // Получаем событие для удаления из сообщения пользователя
        // Ищем напоминание в базе данных по событию
        db.get("SELECT * FROM reminders WHERE event = ?", [eventToDelete], async function (err, row) {
            if (err) {
                console.error(err);
                return;
            }
            if (!row) {
                ctx.reply(`Напоминание "${eventToDelete}" не найдено.`);
            } else {
                // Удаляем напоминание из базы данных
                await removeReminderFromDB(row.id);
                ctx.reply(`Напоминание "${eventToDelete}" успешно удалено.`);
            }
        });
    } catch (error) {
        console.log(error);
    }
});

// Логика обработки сообщений для установки напоминаний
bot.hears(/^!напомни\s/, async ctx => {
    try {
        const regex = /^!напомни\s+([a-zA-Zа-яА-Я\s]+)\s+(\d{1,2})[:.](\d{2})\s*(\d{1,2})[.:](\d{2})?$/g
        const matches = regex.exec(ctx.message.text)

        if (!matches) {
            const errorMessage = await ctx.reply(
                'Неверный формат. Введите событие и время/дату в формате: "событие ЧЧ:ММ" или "событие ДД.MM ЧЧ:ММ"'
            );
            // Удаляем сообщение "Неверный формат" через 30 секунд
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage(errorMessage.message_id);
                } catch (error) {
                    console.log(error);
                }
            }, 30000);
            return;
        }

        const event = matches[1]
        let hour, minute, day, month;
        if (matches[5]) { // если указана дата и время
            hour = parseInt(matches[4])
            minute = parseInt(matches[5])
        } else { // если указано только время
            hour = parseInt(matches[2])
            minute = parseInt(matches[3])
        }

        const now = new Date()

        // Отправляем эмодзи галочки в качестве реакции
        const message = await ctx.reply(`Готово! ✔️`)

        // Удаляем сообщение "Готово!" через 15 секунд
        setTimeout(async () => {
            try {
                await ctx.deleteMessage(message.message_id)
            } catch (error) {
                console.log(error)
            }
        }, 15000)

        if (matches[5]) { // если указана дата и время
            day = parseInt(matches[2])
            month = parseInt(matches[3]) - 1 // месяцы начинаются с 0
            const year = now.getFullYear()
            const reminderDate = new Date(year, month, day, hour, minute)

            if (reminderDate.getTime() < now.getTime()) {
                reminderDate.setDate(now.getDate() + 1)
            }

            const timeDiff = reminderDate.getTime() - now.getTime()

            // Сохраняем напоминание в базу данных
            const insertedId = await addReminderToDB(event, reminderDate.getTime());

            setTimeout(() => {
                ctx.reply(`Напоминаю: ${event}`)
                // Удаляем напоминание из базы данных
                removeReminderFromDB(insertedId);
            }, timeDiff)
        } else { // если указано только время
            const reminderDate = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                hour,
                minute
            )

            if (reminderDate.getTime() < now.getTime()) {
                reminderDate.setDate(now.getDate() + 1)
            }

            const timeDiff = reminderDate.getTime() - now.getTime()

            // Сохраняем напоминание в базу данных
            const insertedId = await addReminderToDB(event, reminderDate.getTime());

            setTimeout(() => {
                ctx.reply(`Напоминаю: ${event}`)
                // Удаляем напоминание из базы данных
                removeReminderFromDB(insertedId);
            }, timeDiff)
        }
    } catch (error) {
        console.log(error)
    }
});

bot.launch();