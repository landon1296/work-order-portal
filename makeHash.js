const bcrypt = require('bcrypt');

// Change this to the password you want to hash
const password = 'landonglls2025'; // <-- EDIT THIS

bcrypt.hash(password, 10, (err, hash) => {
  if (err) throw err;
  console.log('Hashed password:', hash);
});
