// esversion: 8
var mysql = require('mysql');
var bcrypt = require('bcrypt');
var promise = require('promise');
var colors = require('colors');
var salt = 10;

var con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  database: "mydb"
});

con.connect(function(err){
  if (err)
    throw err;
  else {
    console.log("Successfully connected to the database!".green);
  }
});
module.exports = {
  loginDB: function (username, password) { //Attempts to log the user in returns a boolean if successful
    return new Promise(function (resolve, reject){
      con.query("SELECT pass_hash FROM users WHERE username = ?", [username], function (err, result){
        if (err) reject(err);

        if (result.length == 0){
          resolve(false);
          return;
        }

        bcrypt.compare(password, result[0].pass_hash, function (err, res){
          if (err) reject(err);
          else resolve(res);
        });
      });
    });
  },


  signUpDB: function (username, password, email) { //Attempts to add a user to the database returns a boolean if successful
    return new Promise(function (resolve, reject){
      var hashed_pass = bcrypt.hash(password, salt);
      con.query("INSERT INTO users (username, pass_hash, email) VALUES (?,?,?)", [username, hashed_pass, email], function(err, result){
        if (err) reject(err);

        else resolve(result);
      });
    });
  },


  addCookie: function (username, cookie){ //adds a cookie to the database with a given cookie and username
    return new Promise(function(resolve, reject){
      var userId = 0;

      dbQuery("SELECT user_id FROM users WHERE username=?", [username]).then(function(result){
        userId = result[0].user_id;
        dbQuery("SELECT * FROM logged_users WHERE user_id=?", [userId]).then(function(result){
          dbQuery("DELETE FROM logged_users WHERE user_id=?", [userId]).then(function(result){
            dbQuery("INSERT INTO logged_users (user_id, cookie) VALUES (?, ?)", [userId, cookie]).then(function(result){
              resolve(result);
            });
          });
        });
      });
    });
  },


  updateCookie: function (user_id){
    var now = new Date();
    now.setTime(now.getTime() - (60* 60 * 1000 * 5));
    var date = (now.toISOString().slice(0, 19).replace('T', ' '))
    dbQuery("UPDATE logged_users SET signed_in=? WHERE user_id=?", [date, user_id]);
  },


  removeAFKCookies: function(timeout_milliseconds){ //checks all users logged in to see if they are afk for timeout_milliseconds time if true removes them from database
    con.query("SELECT user_id, signed_in FROM logged_users ORDER BY signed_in", function(err, result){
      if (err) throw err;
      else {
        for (var i = 0; i < result.length; i++){
          if ((Date.now() - Date.parse(result[i].signed_in + "")) >= timeout_milliseconds) {
            con.query("DELETE FROM logged_users WHERE user_id=?", [result[0].user_id], function(err, result){
              if (err) throw err;
            });
          } else {
            break;
          }
        }
      }
    });
  },


  hasCookie: function(username){ //returns true if the specified user has a cookie active else returns false
    return new Promise(function(resolve, reject){
      userId = 0;
      findUserId(username).then(function(result){
        userId = result;
        if (userId == null){
          resolve(false);
        } else {
          dbQuery("SELECT * FROM logged_users WHERE user_id=?", [userId]).then(function(result){
            if (result.length > 0){
              resolve(true);
            } else {
              resolve(false);
            }
          });
        }
      });
    });
  },


  getUsername: function(cookie){ //returns the username of a user based on a current cookie else returns null
    return new Promise(function(resolve, reject){
      userId = 0;
      dbQuery("SELECT user_id FROM logged_users WHERE cookie=?", [cookie]).then(function(result){
        if (result.length < 1)
          resolve(null);
        else {
          userId = result[0].user_id;

          dbQuery("SELECT username FROM users WHERE user_id=?", [userId]).then(function(result){
            if (result.length < 1){
              resolve(null);
            } else {
              resolve(result[0].username);
            }
          });
        }
      });
    });
  },

  getIdFromCookie: function(cookie){
    return new Promise(function(resolve, reject){
      dbQuery("SELECT user_id FROM logged_users WHERE cookie=?", [cookie]).then(function(result){
        if (result.length < 1)
          resolve(null);
        else {
          resolve(result[0].user_id);
        }
      });
    });
  },

  addMessage: function(user_id, chat_id, message){
    return new Promise(function(resolve, reject){
      dbQuery("INSERT INTO messages (user_id, chat_id, message) VALUES (?, ?, ?)", [user_id, chat_id, message]).then(function(result){
        resolve(result);
      });
    });
  },


  getMessages: function (chat_id, ammount) { // Gets all messages sent or recieved for a user userId returns the query
    return new Promise(function (resolve, reject){

      con.query("SELECT * FROM messages WHERE chat_id=? ORDER BY message_id DESC LIMIT ?", [chat_id, ammount], function (err, result){
        if (err) reject(err);

        else resolve(result);
      });
    });
  },

  getMessagesRange: function(chat_id, last_message_id, ammount){
    return new Promise(function (resolve, reject){

      con.query("SELECT * FROM messages WHERE chat_id=? AND message_id<? ORDER BY message_id DESC LIMIT ?", [chat_id, last_message_id, ammount], function (err, result){
        if (err) reject(err);

        else resolve(result);
      });
    });
  },

  addImage: function(user_id, chat_id, image_name, image_location){
    return new Promise(function(resolve, reject){
      dbQuery("INSERT INTO messages (user_id, chat_id, message, has_image) VALUES (?, ?, ?, ?)", [user_id, chat_id, "", 1]).then(function(result){
        var message_id = result["insertId"];

        dbQuery("INSERT INTO image_handler (message_id) VALUES (?)", [message_id]).then(function(result){
          var image_id = result["insertId"];
          dbQuery("INSERT INTO images (image_id, image_filepath, image_name) VALUES (?, ?, ?)", [image_id, image_location, image_name]).then(function(result){
            resolve();
          }).catch(function(err){});
        }).catch(function(err){});
      }).catch(function(err){});
    }).catch(function(err){});
  },

  getImage: function(message_id){
    return new Promise(function(resolve, reject){
      dbQuery("SELECT * FROM image_handler WHERE (message_id = ?)", [message_id]).then(function(result){
        var imageIds = [];
        for (var i = 0; i < result.length; i++){
          imageIds.push(result[i].image_id);
        }

        getImageHelper(imageIds).then(function(result){
          resolve(result);
        });
      })
    });
  },

  hasChatAccess: function(chat_id, user_id){
    return new Promise(function(resolve, reject){
      dbQuery("SELECT * FROM chat_users WHERE chat_id=? AND user_id=?", [chat_id, user_id]).then(function(result){
        if (result.length > 0)
          resolve(true);
        else
          resolve(false);
      });
    });
  },

  getUserId: function(username){
    return new Promise(function(resolve, reject){
      findUserId(username).then(function(result){
        resolve(result);
      });
    });
  },

  getUsernameId: function(user_id){
    return new Promise(function(resolve, reject){
      dbQuery("SELECT username FROM users WHERE user_id=?", [user_id]).then(function(result){
        if (result.length < 1) {
          resolve(null);
        } else {
          resolve(result[0].username);
        }
      });
    });
  },

  availableChats: function(user_id){
    return new Promise(function(resolve, reject){
      dbQuery("SELECT chat_id FROM chat_users WHERE user_id=? ORDER BY chat_id DESC", [user_id]).then(function(result){
        var chats = [];
        for (var i = 0; i < result.length; i++){
          chats.push(result[i].chat_id);
        }

        resolve(chats);
      });
    });
  },

  getChatName: function(chat_id){
    return new Promise(function(resolve, reject){
      dbQuery("SELECT name FROM chat_handler WHERE chat_id=?", [chat_id]).then(function(result){
        resolve([result[0].name, chat_id]);
      });
    });
  },

  createChat: function(chatName, chatDescription){
    return new Promise(function(resolve, reject){
      dbQuery("INSERT INTO chat_handler (name, description) VALUES (?, ?)", [chatName, chatDescription]).then(function(result){

        resolve(result.insertId);
      });
    });
  },

  isUserInChat: function(user_id, chat_id){
    return new Promise(function(resolve, result){
      dbQuery("SELECT * FROM chat_users WHERE user_id=? AND chat_id=?", [user_id, chat_id]).then(function(result){
        resolve(result.length > 0);
      });
    });
  },

  addUserToChat: function(user_id, chat_id){
    return new Promise(function(resolve, reject){
      dbQuery("INSERT INTO chat_users (user_id, chat_id) VALUES (?, ?)", [user_id, chat_id]).then(function(){
        resolve();
      });
    });
  },

  addFriend: function(user_id1, user_id2, pending) {//pending is a boolean
    var user_id_small = Math.min(user_id1, user_id2);
    var user_id_big = Math.max(user_id1, user_id2);

    dbQuery("SELECT * FROM user_relation WHERE user_id1=? AND user_id2=?", [user_id_small, user_id_big]).then(function(result){
      if (result.length > 0){
        if (pending == true) {
          dbQuery("UPDATE user_relation SET pending=1, friend=0, requestor_id=? WHERE user_id1=? AND user_id2=?", [user_id1, user_id_small, user_id_big]);
        } else {
          dbQuery("UPDATE user_relation SET pending=0, friend=1, requestor_id=null WHERE user_id1=? AND user_id2=?", [user_id_small, user_id_big]);
        }

        return;
      }
      if (pending == true){
        dbQuery("INSERT INTO user_relation (user_id1, user_id2, requestor_id) values (?, ?, ?)", [user_id_small, user_id_big, user_id1]);
      } else {
        dbQuery("INSERT INTO user_relation (user_id1, user_id2, friend, pending, requestor_id) values (?, ?, 1, 0, null)", [user_id_small, user_id_big]);
      }
    })
  },

  setUserRelation: function(user_id, friend_id, friend, blocked, pending){
    return new Promise(function(resolve, reject){
      var user_id_small = Math.min(user_id, friend_id);
      var user_id_big = Math.max(user_id, friend_id);

      var states = [0,0,0];
      if (friend == true)
        states[0] = 1;

      if (blocked == true)
        states[1] = 1;

      if (pending == true)
        states[2] = 1;

      dbQuery("SELECT user_id1, user_id2, requestor_id FROM user_relation WHERE (user_id1=? AND user_id2=?) ORDER BY user_id1", [user_id_small, user_id_big]).then(function(result){
        if (result.length > 0){
          if (pending == true){
            dbQuery("UPDATE user_relation SET friend=?, blocked=?, pending=?, requestor_id=? WHERE user_id1=? AND user_id2=?", [states[0], states[1], states[2], user_id, user_id_small, user_id_big]).then(function(result){
              resolve();
            });
          } else {
            dbQuery("UPDATE user_relation SET friend=?, blocked=?, pending=?, requestor_id=null WHERE user_id1=? AND user_id2=?", [states[0], states[1], states[2], user_id_small, user_id_big]).then(function(result){
              resolve();
            });
          }
        } else {
          if (pending == true){
            dbQuery("INSERT INTO user_relation (user_id1, user_id2, friend, blocked, pending, requestor_id) VALUES (?, ?, ?, ?, ?, ?)", [user_id_small, user_id_big, states[0], states[1], states[2], user_id]).then(function(result){
              resolve();
            });
          } else {
            dbQuery("INSERT INTO user_relation (user_id1, user_id2, friend, blocked, pending, requestor_id) VALUES (?, ?, ?, ?, ?, null)", [user_id_small, user_id_big, states[0], states[1], states[2]]).then(function(result){
              resolve();
            })
          }
        }
      });
    });
  },

  getUserRelation: function(user_id, friend, blocked, pending){
    return new Promise(function(resolve, reject){
      var states = [0,0,0];
      if (friend == true)
        states[0] = 1;

      if (blocked == true)
        states[1] = 1;

      if (pending == true)
        states[2] = 1;

      dbQuery("SELECT user_id1, user_id2, requestor_id FROM user_relation WHERE (user_id1=? OR user_id2=?) AND (friend=? AND blocked=? AND pending=?) ORDER BY user_id1", [user_id, user_id, states[0], states[1], states[2]]).then(function(result){
        var friends = {};

        if (result.length == 0){
          resolve(friends);
          return;
        }

        var smaller = result[0].user_id1 < user_id;

        for (var i = 0; i < result.length; i++){

          if (!smaller){
            friends[result[i].user_id2] = ["", result[i].requestor_id];
          } else {
            var smaller = result[i].user_id1 < user_id;
            if (!smaller){
              friends[result[i].user_id2] = ["", result[i].requestor_id];
            } else {
              friends[result[i].user_id1] = ["", result[i].requestor_id];
            }
          }
        }

        resolve(friends);
      })
    });
  },

  getUserRelation: function(user_id, friend, blocked, pending, limit){
    return new Promise(function(resolve, reject){
      var states = [0,0,0];
      if (friend == true)
        states[0] = 1;

      if (blocked == true)
        states[1] = 1;

      if (pending == true)
        states[2] = 1;

      dbQuery("SELECT user_id1, user_id2, requestor_id FROM user_relation WHERE (user_id1=? OR user_id2=?) AND (friend=? AND blocked=? AND pending=?) ORDER BY user_id1 LIMIT ?",[user_id, user_id, states[0], states[1], states[2], limit]).then(function(result){
        var friends = {};

        if (result.length == 0){
          resolve(friends);
          return;
        }

        var smaller = result[0].user_id1 < user_id;

        for (var i = 0; i < result.length; i++){
          if (!smaller){
            friends[result[i].user_id2] = ["", result[i].requestor_id];
          } else {
            var smaller = result[i].user_id1 < user_id;
            if (result[i].user_id1 < user_id){
              friends[result[i].user_id1] = ["", result[i].requestor_id];
            } else {

              friends[result[i].user_id2] = ["", result[i].requestor_id];
              smaller = false;
            }
          }
        }

        resolve(friends);
      })
    });
  },

  getSpecificUserRelation: function(user_id1, user_id2, friend, blocked, pending){
    return new Promise(function(resolve, result){
      var user_big = Math.max(user_id1, user_id2);
      var user_small = Math.min(user_id1, user_id2);
      dbQuery("SELECT * from user_relation WHERE user_id1=? AND user_id2=? AND friend=? AND blocked=? AND pending=?", [user_small, user_big, friend, blocked, pending]).then(function(result){
        resolve(result.length > 0);
      });
    });
  },

  createUser: function(username, password, email){ //returns a boolean if it worked: true; failed: false
    return new Promise(function(resolve, reject){
      dbQuery("SELECT * FROM users WHERE email=?", [email]).then(function(result){
        if (result.length > 0){
          resolve(false);
          return;
        }
        bcrypt.hash(password, salt, function(err, hash) {
          if (err) throw err;

          dbQuery("INSERT INTO users (username, pass_hash, email) VALUES (?, ?, ?)", [username, hash, email]).then(function(result){
            resolve(true);
          });
          // Store hash in your password DB.
        });
      })
    });
  },

  getUsersFromName: function(part_username){
    return new Promise(function(resolve, reject){
      getUsersFromNameFunction(part_username).then(function(result){
        resolve(result);
      })
    });
  },

  getFriendableUsers: function(part_username, user_id, friend, blocked, pending){
    return new Promise(function(resolve, reject){
      getUsersFromNameFunction(part_username).then(function(users){
        var loc = 0;

        var userQuery = "(user_id1=" + user_id + " AND (";

        if (Object.keys(users).length == 0){
          return;
        }

        for (var key in users){
          userQuery += "user_id2=" + key;

          if (Object.keys(users).length - 1 != loc) {
            userQuery += " OR ";
          }


          loc++;
        }
        userQuery += "))";

        var userQuery2 = "(user_id2=" + user_id + " AND (";
        loc = 0;

        for (var key in users){
          userQuery2 += "user_id1=" + key;

          if (Object.keys(users).length - 1 != loc){
            userQuery2 += " OR ";
          }

          loc++;
        }

        userQuery2 += "))";

        var query = "SELECT * FROM user_relation WHERE (" + userQuery + " OR " + userQuery2 + ") AND (friend=" + 1 + " OR blocked=" + 1 + " OR pending=" + 1 + ")";

        dbQuery(query).then(function(result){

          delete users[user_id];

          if (result.length == 0){
            resolve(users);
            return;
          }
          var smaller = result[0].user_id1 < user_id;

          for (var i = 0; i < result.length; i++){

            if (!smaller){
              delete users[result[i].user_id2]
            } else {
              smaller = result[i].user_id1 < user_id;
              if (!smaller){
                delete users[result[i].user_id2];
              } else {
                delete users[result[i].user_id1];
              }
            }
          }

          resolve(users);
        });
      });
    });
  },

  getChatAddableUsers: function(chat_id, user_id){
    return new Promise(function(resolve, reject){
      dbQuery("SELECT user_id1, user_id2, requestor_id FROM user_relation WHERE (user_id1=? OR user_id2 = ?) AND (friend=1 AND blocked=0 AND pending=0)", [user_id, user_id]).then(function(result){
        var friends = {};

        if (result.length == 0){
          resolve(null);
          return;
        }

        var smaller = result[0].user_id1 < user_id;

        for (var i = 0; i < result.length; i++){

          if (!smaller){
            friends[result[i].user_id2] = "";
          } else {
            if(result[i].user_id1 < user_id){
              friends[result[i].user_id1] = "";
            } else {
              smaller = false;
              friends[result[i].user_id2] = "";
            }
          }
        }

        dbQuery("SELECT * FROM chat_users WHERE chat_id=?", [chat_id]).then(function(result){
          for (var i = 0; i < result.length; i++){
            if (friends.hasOwnProperty("" + result[i].user_id)){
              delete friends["" + result[i].user_id];
            }
          }
          resolve(friends);
        });


      });
    });
  },

  getUsersInChat: function(chat_id){
    return new Promise(function(resolve, reject){
      dbQuery("SELECT * FROM chat_users WHERE chat_id=?", [chat_id]).then(function(result){
        var users = {};

        if (result.length == 0){
          resolve(users);
          return;
        }

        for (var i = 0; i < result.length; i++){
          users[result[i].user_id] = "";
        }

        resolve(users);
      })
    })
  },

  test: function(){
    dbQuery("SELECT * FROM users WHERE user_id=?", [1]).then(function(result){
      console.log("result: " + result[0].user_id);
    })
  },

  clearRandomImages: function(){
    console.log("yes");
    return new Promise(function(resolve, reject){
      dbQuery("SELECT * FROM messages WHERE has_image=?", [1]).then(function(result){
        console.log("no");
        if (result.length == 0){
          resolve();
          return;
        }

        console.log("maybe");

        var complete = 0;

        function removeMessages(message_id) {
          console.log("hello world!");
          dbQuery("SELECT * FROM image_handler WHERE message_id=?", [message_id]).then(function(result){
            if (result.length == 0){
              dbQuery("DELETE FROM messages WHERE message_id=?", [message_id]).then(function(){
                complete++;

                if (complete == result.length){
                  resolve();
                }
              });
            } else {
              complete++;

              if (complete == result.length){
                resolve();
              }
            }
          });
        }


        for (var i = 0; i < result.length; i++){
          var message_id = result[i].message_id;
          removeMessages(message_id);
        }

      })
    })
  }


  /*

    This is the end of the included functions

   */
};


function dbQuery(query){ //makes sure that the promise is finished
  return new Promise(function(resolve, reject){
    con.query(query, function(err, result){
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function dbQuery(query, data){
  return new Promise(function(resolve, reject){
    con.query(query, data, function(err, result){
      if (err) reject(err);
      else resolve(result);
    })
  });
}

function findUserId(username){ //returns userId if it finds one, else returns null
  return new Promise(function (resolve, reject){
    dbQuery("SELECT user_id FROM users WHERE username=?", [username]).then(function(result){
      if (result.length < 1){
        resolve(null);
      }
      resolve(result[0].user_id);
    });
  });


  //for the  chat message id put the lower id in first then the second user id
}

function getChatId(user_id){
  return new Promise(function (resolve, reject){

    dbQuery("SELECT chat_id FROM message_handler WHERE user_id=?", [user_id]).then(function(result){
      if (result.length == 0){
        resolve(null);
        return;
      }

      resolve(result[0].chat_id);
    });
  });
}

function sendMessage(sender, chat_id, message){ //sender first
  return new Promise(function (resolve, reject){
    dbQuery("UPDATE message_handler SET last_message=? WHERE chat_id=?", [(new Date().toISOString().slice(0, 19).replace('T', ' ')), chat_id]);

    dbQuery("INSERT INTO messages (send_id, chat_id, message) VALUES (?, ?, ?)", [sender, chat_id, message]).then(function(result){
      resolve(true);
    });
  });
}

function isSpecificRelation(user_id, user_id2, friend, blocked, pending){
  return new Promise(function(resolve, reject){
    getSpecificRelation(user_id, user_id2, friend, blocked, pending).then(function(result){
      resolve([result, user_id, user_id2]);
    })
  });
}

function getUsersFromNameFunction(part_username){
  return new Promise(function(resolve, reject){
    if (part_username.charAt(0) == "#"){
      part_username = part_username.substr(1);
      part_username = "%" + part_username + "%";
      dbQuery("SELECT username, user_id FROM users WHERE (user_id LIKE ?) LIMIT 10", [part_username]).then(function(result){

        var users = {};

        for (var i = 0; i < result.length; i++){
          users[result[i].user_id] = result[i].username;
        }

        resolve(users);
        return;
      });
    } else {
      part_username = "%" + part_username + "%";
      dbQuery("SELECT username, user_id FROM users WHERE (username LIKE ?) LIMIT 10", [part_username]).then(function(result){

        var users = {};
        for (var i = 0; i < result.length; i++){
          users[result[i].user_id] = result[i].username;
        }

        resolve(users);
        return;
      });
    }

  })
}

function getImageHelper(imageIds){ //returns a promise of a image_id: path pair
  return new Promise(function(resolve, reject){
    var total = 0;
    var img_paths = {}; //image_id: path
    for (var i = 0; i < imageIds.length; i++){
      dbQuery("SELECT * FROM images WHERE (image_id = ?)", [imageIds[i]]).then(function(result){
        if (result.length == 0){
          resolve(null);
          return;
        }
        result = result[0];
        img_paths[result.image_id] = result.image_filepath;
        total ++;
        if (total >= imageIds.length){
          resolve(img_paths);
        }
      });
    }
  });
}
