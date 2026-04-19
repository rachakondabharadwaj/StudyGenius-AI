import * as fs from 'fs';
let code = fs.readFileSync('services/geminiService.ts', 'utf8');
code = code.replace(/ai\.models/g, 'getAI().models');
code = code.replace(/ai\.chats/g, 'getAI().chats');
fs.writeFileSync('services/geminiService.ts', code);
