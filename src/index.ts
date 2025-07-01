import { Bot } from "grammy";
import { appendFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const bot = new Bot(process.env.BOT_TOKEN!);

const args = process.argv.slice(2);
const enableFileLogging = args.includes('--log-files');
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
    console.log('kyora - advanced anti-spam bot for telegram\n');
    console.log('usage: bun start [options]\n');
    console.log('options:');
    console.log('  --log-files    enable file logging (default: console only)');
    console.log('  --help, -h     show this help message');
    process.exit(0);
}

const shouldLogToFile = enableFileLogging;

const LOG_FILE = join(process.cwd(), "messages.ndjson");
const SPAM_LOG_FILE = join(process.cwd(), "spam-messages.ndjson");

if (shouldLogToFile) {
    if (!existsSync(LOG_FILE)) {
        writeFileSync(LOG_FILE, "");
    }
    if (!existsSync(SPAM_LOG_FILE)) {
        writeFileSync(SPAM_LOG_FILE, "");
    }
}

function extractMessageData(msg: any) {
    return {
        message_id: msg.message_id,
        date: msg.date,
        text: msg.text,
        caption: msg.caption,
        entities: msg.entities,
        caption_entities: msg.caption_entities,
        photo: msg.photo,
        video: msg.video,
        audio: msg.audio,
        document: msg.document,
        animation: msg.animation,
        sticker: msg.sticker,
        voice: msg.voice,
        video_note: msg.video_note,
        reply_to_message: msg.reply_to_message ? {
            message_id: msg.reply_to_message.message_id,
            date: msg.reply_to_message.date,
            from: msg.reply_to_message.from,
            chat: msg.reply_to_message.chat,
            text: msg.reply_to_message.text,
            caption: msg.reply_to_message.caption,
            full_data: msg.reply_to_message
        } : undefined,
        forward_origin: msg.forward_origin,
        forward_from: msg.forward_from,
        forward_from_chat: msg.forward_from_chat,
        forward_from_message_id: msg.forward_from_message_id,
        forward_signature: msg.forward_signature,
        forward_sender_name: msg.forward_sender_name,
        forward_date: msg.forward_date,
        quote: msg.quote,
        link_preview_options: msg.link_preview_options,
        message_thread_id: msg.message_thread_id,
        is_topic_message: msg.is_topic_message,
        reactions: msg.reactions,
        reply_markup: msg.reply_markup,
        via_bot: msg.via_bot,
        edit_date: msg.edit_date,
        has_protected_content: msg.has_protected_content,
        is_automatic_forward: msg.is_automatic_forward,
        _raw: msg
    };
}

function isExternalChannelQuote(msg: any, currentChatId: number | string): boolean {
    if (msg.external_reply) {
        console.log(`detected external_reply from chat: ${msg.external_reply.chat?.title || msg.external_reply.chat?.id}`);
        return true;
    }
    
    if (msg.reply_to_message && msg.reply_to_message.chat?.id !== currentChatId) {
        console.log(`detected cross-chat reply from: ${msg.reply_to_message.chat?.title || msg.reply_to_message.chat?.id}`);
        return true;
    }
    
    return false;
}

function logMessage(data: any, isSpam: boolean = false) {
    const chatInfo = data.chat?.title || data.chat?.username || data.chat?.id || 'unknown';
    const preview = data.messageData?.text?.substring(0, 50) || 
                   data.messageData?.caption?.substring(0, 50) || 
                   '[no text content]';
    const spamLabel = isSpam ? '[spam deleted] ' : '';
    console.log(`${spamLabel}${data.type || 'message'} from ${chatInfo}: ${preview}${preview.length >= 50 ? '...' : ''}`);
    
    if (shouldLogToFile) {
        try {
            const logFile = isSpam ? SPAM_LOG_FILE : LOG_FILE;
            appendFileSync(logFile, JSON.stringify(data) + "\n");
        } catch (error) {
            console.error("error writing to log file:", error);
        }
    }
}

bot.on("message", async (ctx) => {
    const messageData = {
        timestamp: new Date().toISOString(),
        type: "message",
        chat: ctx.chat,
        from: ctx.from,
        messageData: extractMessageData(ctx.message),
        msgId: ctx.msgId,
        chatId: ctx.chatId,
        _fullUpdate: ctx.update,
    };
    
    const isSpam = isExternalChannelQuote(ctx.message, ctx.chatId);
    
    if (isSpam) {
        messageData.type = "spam_message_deleted";
        logMessage(messageData, true);
        
        try {
            await ctx.deleteMessage();
            console.log(`deleted spam message (external channel quote) from ${ctx.from?.username || ctx.from?.id}`);
        } catch (error) {
            console.error(`failed to delete spam message:`, error);
        }
    } else {
        logMessage(messageData);
    }
});

bot.on("edited_message", (ctx) => {
    const messageData = {
        timestamp: new Date().toISOString(),
        type: "edited_message",
        chat: ctx.chat,
        from: ctx.from,
        messageData: extractMessageData(ctx.editedMessage),
        _fullUpdate: ctx.update,
    };
    
    const isSpam = isExternalChannelQuote(ctx.editedMessage, ctx.chatId);
    logMessage(messageData, isSpam);
    
    if (isSpam) {
        console.log(`detected spam in edited message but cannot delete retroactively`);
    }
});

bot.on("channel_post", (ctx) => {
    const messageData = {
        timestamp: new Date().toISOString(),
        type: "channel_post",
        chat: ctx.chat,
        messageData: extractMessageData(ctx.channelPost),
        _fullUpdate: ctx.update,
    };
    
    logMessage(messageData);
});

bot.on("edited_channel_post", (ctx) => {
    const messageData = {
        timestamp: new Date().toISOString(),
        type: "edited_channel_post",
        chat: ctx.chat,
        messageData: extractMessageData(ctx.editedChannelPost),
        _fullUpdate: ctx.update,
    };
    
    logMessage(messageData);
});

bot.use((ctx, next) => {
    if (ctx.message || ctx.editedMessage || ctx.channelPost || ctx.editedChannelPost) {
        return next();
    }
    
    const updateData = {
        timestamp: new Date().toISOString(),
        type: "other_update",
        update: ctx.update,
        updateType: Object.keys(ctx.update).filter(k => k !== 'update_id').join(', '),
    };
    
    logMessage(updateData);
    return next();
});

bot.start({
    onStart: (botInfo) => {
        console.log(`bot @${botInfo.username} started`);
        console.log(`spam protection: enabled`);
        if (shouldLogToFile) {
            console.log(`file logging: enabled`);
            console.log(`  messages: ${LOG_FILE}`);
            console.log(`  spam: ${SPAM_LOG_FILE}`);
        } else {
            console.log(`file logging: disabled (use --log-files to enable)`);
        }
    },
});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());