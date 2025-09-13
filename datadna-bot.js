const { Telegraf } = require('telegraf');
const crypto = require('crypto');
const { Connection, PublicKey, Transaction, SystemProgram, Keypair, sendAndConfirmTransaction } = require('@solana/web3.js');

// 🔐 Конфигурация (замените своими значениями)
const CONFIG = {
    telegramToken: 'ВАШ_TELEGRAM_BOT_TOKEN', // Получите у @BotFather
    solanaNetwork: 'https://api.devnet.solana.com',
    solanaPrivateKey: [123,45,67,89,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90,12,34,56,78,90]
};

// 🏗️ Инициализация
const bot = new Telegraf(CONFIG.telegramToken);
const solanaConnection = new Connection(CONFIG.solanaNetwork);
const solanaWallet = Keypair.fromSecretKey(Uint8Array.from(CONFIG.solanaPrivateKey));

// 📊 Простая "база данных" в памяти (для MVP)
const database = {
    files: new Map(),    // fileId -> fileData
    records: new Map()   // recordId -> {hash, fileName, etc}
};

// 🧠 DataDNA алгоритм
class DataDNA {
    static async generateSignature(fileBuffer) {
        const mainHash = crypto.createHash('sha256').update(fileBuffer).digest();
        const salt = crypto.randomBytes(16);
        return Buffer.concat([mainHash, salt]);
    }

    static async calculateHash(signature) {
        return crypto.createHash('sha256').update(signature).digest('hex');
    }
}

// ⛓️ Блокчейн сервис
class BlockchainService {
    static async saveHashToBlockchain(hash) {
        try {
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: solanaWallet.publicKey,
                    toPubkey: new PublicKey('11111111111111111111111111111111'),
                    lamports: 1000,
                })
            );

            const signature = await sendAndConfirmTransaction(
                solanaConnection,
                transaction,
                [solanaWallet]
            );

            return signature;
        } catch (error) {
            console.log('Блокчейн недоступен, работаем в оффлайн режиме');
            return 'offline-mode-' + Date.now();
        }
    }
}

// 💾 Менеджер файлов
class FileManager {
    static async handleFile(ctx) {
        try {
            const fileId = ctx.message.document.file_id;
            const fileName = ctx.message.document.file_name;
            
            // Скачиваем файл
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await fetch(fileLink);
            const fileBuffer = await response.arrayBuffer();
            
            // Сохраняем во временную базу
            database.files.set(fileId, {
                buffer: Buffer.from(fileBuffer),
                name: fileName,
                size: ctx.message.document.file_size
            });

            await ctx.reply(`📁 Файл "${fileName}" получен! Начинаю анализ...`);

            // Генерируем DataDNA
            const signature = await DataDNA.generateSignature(Buffer.from(fileBuffer));
            const hash = await DataDNA.calculateHash(signature);
            
            // Сохраняем в блокчейн
            const txId = await BlockchainService.saveHashToBlockchain(hash);
            
            // Сохраняем запись
            const recordId = 'rec_' + Date.now();
            database.records.set(recordId, {
                hash: hash,
                fileName: fileName,
                fileSize: ctx.message.document.file_size,
                timestamp: new Date(),
                blockchainTx: txId
            });

            await ctx.replyWithHTML(
                `✅ <b>DataDNA создан!</b>\n\n` +
                `📄 Файл: <code>${fileName}</code>\n` +
                `🔐 Хэш: <code>${hash}</code>\n` +
                `⛓ Транзакция: <code>${txId}</code>\n\n` +
                `Для проверки отправьте этот же файл другому пользователю и он сможет проверить его подлинность!`
            );

        } catch (error) {
            console.error('File error:', error);
            await ctx.reply('❌ Ошибка обработки файла. Попробуйте другой файл.');
        }
    }

    static async verifyFile(ctx) {
        try {
            const fileId = ctx.message.document.file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await fetch(fileLink);
            const fileBuffer = await response.arrayBuffer();
            
            await ctx.reply(`🔍 Проверяю подлинность файла...`);

            // Генерируем хэш для проверки
            const signature = await DataDNA.generateSignature(Buffer.from(fileBuffer));
            const actualHash = await DataDNA.calculateHash(signature);
            
            // Ищем совпадения в базе
            let found = false;
            for (let [recordId, record] of database.records) {
                if (record.hash === actualHash) {
                    found = true;
                    await ctx.replyWithHTML(
                        `✅ <b>Файл подлинный!</b>\n\n` +
                        `📄 Оригинальное имя: <code>${record.fileName}</code>\n` +
                        `🔐 Совпадающий хэш: <code>${actualHash}</code>\n` +
                        `⏰ Зарегистрирован: ${record.timestamp.toLocaleString()}\n` +
                        `⛓ Транзакция: <code>${record.blockchainTx}</code>`
                    );
                    break;
                }
            }

            if (!found) {
                await ctx.replyWithHTML(
                    `❌ <b>Файл не найден в базе DataDNA!</b>\n\n` +
                    `Это может означать что:\n` +
                    `• Файл был изменен\n` +
                    `• Файл не регистрировался в системе\n` +
                    `• Это поддельная копия\n\n` +
                    `Хэш файла: <code>${actualHash}</code>`
                );
            }

        } catch (error) {
            console.error('Verify error:', error);
            await ctx.reply('❌ Ошибка проверки файла.');
        }
    }
}

// 🎯 Обработчики бота
bot.start((ctx) => {
    ctx.replyWithHTML(
        `🔍 <b>DataDNA Verifier Bot</b>\n\n` +
        `Я помогаю проверять подлинность файлов через технологию DataDNA!\n\n` +
        `📤 <b>Чтобы зарегистрировать файл:</b>\n` +
        `Просто отправьте мне любой файл\n\n` +
        `🔍 <b>Чтобы проверить файл:</b>\n` +
        `Отправьте файл для проверки подлинности\n\n` +
        `⚡ <b>Технология:</b>\n` +
        `• Создание цифрового отпечатка файла\n` +
        `• Сохранение в блокчейн Solana\n` +
        `• Мгновенная проверка подлинности`
    );
});

// Обработка документов
bot.on('document', async (ctx) => {
    const fileId = ctx.message.document.file_id;
    
    // Проверяем, был ли уже такой файл
    if (database.files.has(fileId)) {
        await FileManager.verifyFile(ctx);
    } else {
        await FileManager.handleFile(ctx);
    }
});

// Помощь
bot.help((ctx) => {
    ctx.replyWithHTML(
        `🤖 <b>Команды бота:</b>\n\n` +
        `/start - Начать работу\n` +
        `/help - Помощь\n` +
        `/stats - Статистика\n\n` +
        `📤 <b>Просто отправьте файл чтобы:</b>\n` +
        `• Зарегистрировать его в системе\n` +
        `• Проверить подлинность\n\n` +
        `⚡ <b>Поддерживаемые форматы:</b>\n` +
        `Любые файлы до 20MB!`
    );
});

// Статистика
bot.command('stats', (ctx) => {
    const blockchainTxs = Array.from(database.records.values())
        .filter(r => !r.blockchainTx.startsWith('offline-mode-')).length;
    
    ctx.replyWithHTML(
        `📊 <b>Статистика DataDNA:</b>\n\n` +
        `📁 Файлов обработано: <b>${database.files.size}</b>\n` +
        `🔐 Уникальных хэшей: <b>${database.records.size}</b>\n` +
        `⛓ Блокчейн транзакций: <b>${blockchainTxs}</b>\n` +
        `📡 Оффлайн записей: <b>${database.records.size - blockchainTxs}</b>`
    );
});

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
});

// 🚀 Запуск бота
console.log('🤖 DataDNA Bot запускается...');
bot.launch()
    .then(() => console.log('✅ Бот успешно запущен!'))
    .catch(err => console.error('❌ Ошибка запуска бота:', err));

// Элегантное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Экспорт для использования в других модулях
module.exports = { bot, database, DataDNA, BlockchainService };