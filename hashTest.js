const bcrypt = require('bcrypt');

const saltRounds = 10;
const myPlaintextPassword = "waffles";

bcrypt.hash(myPlaintextPassword, saltRounds, function (err, hash){
  if (err){
    console.log(err);
  }

  console.log("hash: " + hash + "\n" + hash.length);
});

// hash = "$2b$10$MmHUZShPdQdDGkLulPxUIOyBzyMKmgsDx7FpIas7gGB3j2FKQ5J/2";
// bcrypt.compare(myPlaintextPassword, hash, function(err, res){
//   if (err){
//     console.log(err);
//   }
//   console.log("first: " + res);
// });
