const { Keypair } = require('@solana/web3.js');

console.log('🔐 Генерация Solana кошелька...\n');

const newWallet = Keypair.generate();

console.log('✅ Кошелек успешно создан!');
console.log('📮 Public Key:', newWallet.publicKey.toString());
console.log('🔑 Private Key:', JSON.stringify(Array.from(newWallet.secretKey)));

console.log('\n⚠️  ВАЖНО: Сохраните приватный ключ в безопасном месте!');
console.log('❌ Никогда не делитесь им и не коммитьте в GitHub!');