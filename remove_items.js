const fs = require('fs');
let code = fs.readFileSync('jewelry-data.js', 'utf8');

const idsToRemove = ['e13', 'e154', 'n9'];

idsToRemove.forEach(id => {
  const regex = new RegExp(`\\s+\\{\\s+id:\\s*'${id}'[\\s\\S]*?\\},`, 'g');
  code = code.replace(regex, '');
});

fs.writeFileSync('jewelry-data.js', code);
console.log('Finished removing duplicates.');
