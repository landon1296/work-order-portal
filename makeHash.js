const bcrypt = require('bcrypt');

// Change this to the password you want to hash
const password = 'Trebomb0807!'; // <-- EDIT THIS

bcrypt.hash(password, 10, (err, hash) => {
  if (err) throw err;
  console.log('Hashed password:', hash);
});



// To run, type "node makeHash.js" in the root terminal