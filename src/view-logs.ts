import { readFileSync, existsSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const showFull = args.includes('--full');
const filterType = args.find(arg => arg.startsWith('--type='))?.split('=')[1];
const filterForwards = args.includes('--forwards');
const filterReplies = args.includes('--replies');
const filterQuotes = args.includes('--quotes');
const showSpam = args.includes('--spam');

const LOG_FILE = join(process.cwd(), showSpam ? "spam-messages.ndjson" : "messages.ndjson");

console.log('message log viewer');
console.log('==================');
console.log('usage: bun view-logs [options]');
console.log('options:');
console.log('  --full           show full json data');
console.log('  --spam           view spam messages log');
console.log('  --type=TYPE      filter by message type');
console.log('  --forwards       show only forwarded messages');
console.log('  --replies        show only replies');
console.log('  --quotes         show only messages with quotes');
console.log('');

if (showSpam) {
    console.log('viewing spam messages log');
    console.log('messages that were automatically deleted for quoting external channels.\n');
}

try {
    if (!existsSync(LOG_FILE)) {
        console.log(`no log file found at: ${LOG_FILE}`);
        console.log(`\nmake sure the bot is running with file logging enabled:`);
        console.log(`  bun start --log-files`);
        process.exit(0);
    }
    
    const content = readFileSync(LOG_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    let messages = lines.map((line, index) => {
        try {
            return JSON.parse(line);
        } catch (err) {
            console.error(`error parsing line ${index + 1}:`, err);
            return null;
        }
    }).filter(msg => msg !== null);
    
    if (filterType) {
        messages = messages.filter(msg => msg.type === filterType);
    }
    if (filterForwards) {
        messages = messages.filter(msg => 
            msg.messageData?.forward_from || 
            msg.messageData?.forward_from_chat ||
            msg.messageData?.forward_origin
        );
    }
    if (filterReplies) {
        messages = messages.filter(msg => msg.messageData?.reply_to_message);
    }
    if (filterQuotes) {
        messages = messages.filter(msg => msg.messageData?.quote);
    }
    
    console.log(`found ${messages.length} messages after filtering.\n`);
    
    messages.forEach((data, index) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`message ${index + 1} - ${data.type} - ${data.timestamp}`);
        console.log(`${'='.repeat(60)}`);
        
        const chat = data.chat;
        if (chat) {
            console.log(`chat: ${chat.title || chat.username || `private (${chat.id})`}`);
        }
        
        const from = data.from;
        if (from) {
            console.log(`from: ${from.first_name}${from.last_name ? ' ' + from.last_name : ''} (@${from.username || 'no-username'}) [${from.id}]`);
        }
        
        const msg = data.messageData;
        if (msg) {
            if (msg.text) {
                console.log(`\ntext:\n${msg.text}`);
            }
            if (msg.caption) {
                console.log(`\ncaption:\n${msg.caption}`);
            }
            
            if (msg.photo) {
                console.log(`\nphoto: ${msg.photo.length} sizes`);
            }
            if (msg.video) {
                console.log(`\nvideo: ${msg.video.file_name || 'unnamed'} (${msg.video.duration}s)`);
            }
            if (msg.document) {
                console.log(`\ndocument: ${msg.document.file_name || 'unnamed'} (${msg.document.mime_type})`);
            }
            if (msg.audio) {
                console.log(`\naudio: ${msg.audio.title || 'unnamed'} by ${msg.audio.performer || 'unknown'}`);
            }
            if (msg.voice) {
                console.log(`\nvoice message: ${msg.voice.duration}s`);
            }
            if (msg.sticker) {
                console.log(`\nsticker: ${msg.sticker.emoji || 'no-emoji'} from set ${msg.sticker.set_name || 'unknown'}`);
            }
            
            if (msg.reply_to_message) {
                console.log(`\nreply to:`);
                const reply = msg.reply_to_message;
                console.log(`   from: ${reply.from?.first_name || 'unknown'} (@${reply.from?.username || 'no-username'})`);
                console.log(`   text: ${reply.text?.substring(0, 100) || reply.caption?.substring(0, 100) || '[no text]'}${(reply.text?.length || 0) > 100 ? '...' : ''}`);
                if (reply.chat?.id !== chat?.id) {
                    console.log(`   from different chat: ${reply.chat?.title || reply.chat?.username || reply.chat?.id}`);
                }
            }
            
            if (msg._raw?.external_reply) {
                console.log(`\nexternal channel quote (spam):`);
                const ext = msg._raw.external_reply;
                console.log(`   from channel: ${ext.chat?.title || ext.chat?.username} (${ext.chat?.id})`);
                console.log(`   message id: ${ext.message_id}`);
                if (msg.quote) {
                    console.log(`   quoted text: ${msg.quote.text?.substring(0, 200)}${(msg.quote.text?.length || 0) > 200 ? '...' : ''}`);
                }
            }
            
            if (msg.forward_origin || msg.forward_from || msg.forward_from_chat) {
                console.log(`\nforwarded:`);
                if (msg.forward_origin) {
                    console.log(`   origin: ${JSON.stringify(msg.forward_origin)}`);
                }
                if (msg.forward_from) {
                    console.log(`   from user: ${msg.forward_from.first_name} (@${msg.forward_from.username || 'no-username'})`);
                }
                if (msg.forward_from_chat) {
                    console.log(`   from chat: ${msg.forward_from_chat.title || msg.forward_from_chat.username} (${msg.forward_from_chat.id})`);
                }
                if (msg.forward_date) {
                    console.log(`   original date: ${new Date(msg.forward_date * 1000).toISOString()}`);
                }
            }
            
            if (msg.quote && !msg._raw?.external_reply) {
                console.log(`\nquote:`);
                console.log(`   text: ${msg.quote.text}`);
                if (msg.quote.position !== undefined) {
                    console.log(`   position: ${msg.quote.position}`);
                }
            }
            
            if (msg.message_thread_id) {
                console.log(`\nthread/topic id: ${msg.message_thread_id}`);
            }
        }
        
        if (showFull) {
            console.log(`\nfull data:`);
            console.log(JSON.stringify(data, null, 2));
        }
    });
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`total messages displayed: ${messages.length}`);
} catch (error) {
    console.error("error reading log file:", error);
    console.log("\nmake sure the bot has run and logged some messages first!");
} 