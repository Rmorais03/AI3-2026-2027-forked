import bcrypt from 'bcryptjs';

const [palavraPasse, ...argumentosExtra] = process.argv.slice(2);
const comprimento = palavraPasse ? Array.from(palavraPasse).length : 0;

if (!palavraPasse || argumentosExtra.length > 0 || comprimento < 8 || comprimento > 128) {
  console.error('Utilização: node gerar-hash.js "<palavra-passe com 8 a 128 caracteres>"');
  process.exitCode = 1;
} else {
  const hash = await bcrypt.hash(palavraPasse, 10);
  console.log(hash);
}
