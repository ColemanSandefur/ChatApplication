var bodyParser = require("body-parser");
var express = require('express');

var app = express();

var http = require('http').createServer(app);
var io = require('socket.io')(http);
var ss = require("socket.io-stream");
var promise = require("bluebird");
var cookieParser = require('cookie-parser');
var sanitizeHTML = require('sanitize-html');
var colors = require('colors');
var path = require("path");
var formidable = require("formidable");
var fs = require("fs");
var sha256 = require("js-sha256");
var saveFile = require("save-file");

/*
 * External Files
 */

require('./update_logged_users');
var myDb = require('./database');

app.use(cookieParser());
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, "static")));

var userDict = {};

/*

    Domain Functions

*/

///////////////////////////////////////////////////////////////////////////////////////////////////
////  GET  ////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

//get the cookies by doing req.cookies; clear with res.clearCookie(name);  res.cookie(cookie name, cookie value)

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.get('/loginScreen', function(req, res){
  res.sendFile(__dirname + "/login.html");
});

app.get('/personal', function(req, res){
  res.sendFile(__dirname + "/personal.html");
});

app.get('/createAccount', function(req, res){
  res.sendFile(__dirname + "/createAccount.html");
});

app.get('/friends', function(req, res){
  res.sendFile(__dirname + "/friends.html");
});

app.get("/uploadImage", function(req, res){
  res.sendFile(__dirname + "/uploadImage.html");;
})

app.get("/unassignedImages", function(req,res){
  res.send("hi");
  myDb.clearRandomImages();
})
///////////////////////////////////////////////////////////////////////////////////////////////////
////  POST  ///////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

app.post('/loginScreen', function(req, res){
  var userId = "";

  var username = req.body.user;
  var password = req.body.pass;

  username = username.trim();
  password = password.trim();

  if (username.length == 0 || password.length == 0){

    res.sendFile(__dirname + "/loginScreenAlert.html");
    return;
  }


  myDb.loginDB(username, password).then(function(resolve, reject){
    if (reject){
      throw reject;
    }

    if (resolve == true){
      userId = randomLetters(64);
      res.cookie('userId', userId);
      myDb.addCookie(username, userId);
      res.redirect("/personal");
    } else {
      res.redirect("/loginScreen");
    }
  });
});

app.post("/createAccount", function(req, res){
  if (req.body.username.trim().length == 0 || req.body.password.trim().length == 0 || req.body.confirmPass.trim().length == 0 || req.body.email.trim().length == 0)
    res.redirect("/createAccount");

  var username = cleanse(req.body.username.trim());
  var pass = cleanse(req.body.password.trim());

  if (req.body.password.trim() != req.body.confirmPass.trim())
    res.redirect("/createAccount");
    myDb.createUser(username, pass, req.body.email.trim()).then(function(){
    res.redirect("/personal");
  });
});

http.listen(3000, function(){ // Opens the port 3000 for server communication
  console.log('listening on *:3000');
});

/*

    Socket.io Functions

*/

io.on('connection', function(socket){

  /*

    Assigning the socket.id to the cookie if they're logged in

   */

  var cookie = socket.handshake.headers.cookie + ";"; //puts a semicolon to the end of the cookie to make sure all cookies end with a semicolon

  var userId = "";
  if (cookie.indexOf("userId") > -1){ //checks if the user already has a cookie.
    //if user has a userId cookie it assigns it to the socket id
    userId = cookie.substring(cookie.indexOf("userId=") + 1 + "userId".length, cookie.indexOf(";", cookie.indexOf("userId=")));
    socket.id = userId;
  }

  var chatId = 0;

  // Notify user connected
  console.log("user connected, id:".green + socket.id + "");

  socket.on('disconnect', function(){ // When the user disconnects
    // Notify user disconnected
    console.log("user disconnected, id:".yellow + socket.id.yellow);
  });

  /*
   *
   *
   *Personal Page Specific functions
   *
   *
   */



  socket.on("get-chat-test", function(){
    var stream = ss.createStream({highWaterMark: 1024, objectMode: true});
    myDb.getMessages(17, 20).then(function(result){
      getFile(255).then(function(result){
        ss(socket).emit("give-chat-test", stream);
        stream.write(result);
      });
    });
  });

  ss(socket).on("stream-upload", function(stream){
    stream.on("data", (data) => {
      var chat_id = data[0];
      var fileArray = data[1];


      myDb.getIdFromCookie(socket.id).then(function(user_id){
        myDb.hasChatAccess(chat_id, user_id).then(function(hasAccess){
          // if (!hasAccess){
          //   return;
          // }

          for (var i = 0; i < fileArray.length; i++){
            //Get data from fileArra
            var fileName = fileArray[i][1];
            var fileData = fileArray[i][0];

            //create the new name (sha256)
            var sha = sha256(fileData);//sha256 of file
            var ext = path.extname(fileName);//file extension
            var newName = "images/" + chat_id + "/" + sha + ext;

            saveFileHelper(fileData, newName, fileName).then(function(data){
              var fileName = data[0];
              var newName = data[1];
              var buffer = data[2];

              myDb.updateCookie(user_id);
              myDb.addImage(user_id, chat_id, fileName, newName).then(function(messageData){
                var message_id = messageData[0];
                var image_id = messageData[1];

                var dat = {};
                dat[image_id] = buffer;

                cacheIt(user_id).then(function(){
                  var sockets = io.sockets.sockets;
                  for(var socketId in sockets)
                  {
                    var cur_socket = sockets[socketId];
                    // updateUser2(chat_id, message_id, image_id, cur_socket, [userDict[user_id], ""], dat);
                    // updateUserTest(input[0], curSocket, "update_chat", [userDict[user_id], input[1], result.insertId, user_id]);

                    updateUserTest(chat_id, cur_socket, "update_chat", [chat_id, userDict[user_id], "", message_id, user_id, image_id]);
                    var stream = ss.createStream({objectMode: true});

                    ss(cur_socket).emit("give_images", stream);
                    stream.write(dat);


                  }
                });
              });
            });
          }
        });
      });
    });
  });

  socket.on("file-upload", function(data){ //data: [chat_id, [fileName, fileData]]
    var chat_id = data[0];

    myDb.getIdFromCookie(socket.id).then(function(user_id){
      myDb.hasChatAccess(chat_id, user_id).then(function(hasAccess){
        if (!hasAccess){
          return;
        }
        var datArray = data[1];

        for (var i = 0; i < datArray.length; i++){
          var fileName = datArray[i][0];
          var fileData = datArray[i][1];
          var sha = sha256(fileData);

          var ext = path.extname(fileName);
          var newName = "images/" + chat_id + "/" + sha + ext;

          saveFileHelper(fileData, newName, fileName).then(function(data){// oldFileName, fileName, buffer
            var fileName = data[0];
            var newName = data[1];
            var buffer = data[2];
            myDb.updateCookie(user_id);
            myDb.addImage(user_id, chat_id, fileName, newName);


            //give the images to clients that already have the page loaded
            cacheIt(user_id).then(function(){
              var sockets = io.sockets.sockets;
              for(var socketId in sockets)
              {
                var cur_socket = sockets[socketId]; //loop through and do whatever with each connected socket

                // cur_socket.emit('update_chat', input[0]);
                //...
                updateUser(chat_id, cur_socket, [userDict[user_id], ""], buffer);
              }
            });
          });
        }
      });
    });
  });

  socket.on('waiting-personal', function(){ // user asking for available chats
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      if (user_id == null){
        socket.emit("login_alert");
        return;
      }
      myDb.updateCookie(user_id);
      myDb.availableChats(user_id).then(function(chats){ //chats is an array of chat ids
        var available_chats = {};
        var track = 0;
        if (chats.length == 0){
          socket.emit("personal-response", "");
          socket.emit("give_user_id", user_id);
        }
        myDb.getChatInfo(chats[0]);
        for (var i = 0; i < chats.length; i++){
          available_chats[chats[i]] = null;
          myDb.getChatInfo(chats[i]).then(function(result){ //result is an array of [chat_name, chat_id]
            available_chats[result[1]] = result[0];
            track++;
            if (track == chats.length) {
              socket.emit("personal-response", available_chats);
              socket.emit("give_user_id", user_id);
            }
          });
        }
      });
    });
  });

  /*

    Manipulating the chats

   */

  socket.on("createChat", function(input){
    //input = [chat_name, chat_description]

    myDb.createChat(input[0], input[1]).then(function(chat_id){
      myDb.getIdFromCookie(socket.id).then(function(user_id){
        myDb.addUserToChat(user_id, chat_id).then(function(){
          socket.emit("createdChat");
        });
      });
    });
  });

  socket.on("getAvailableUsersForChat", function(chat_id){
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      if (user_id == null){
        socket.emit("login_alert");
        return;
      }

      myDb.getChatAddableUsers(chat_id, user_id).then(function(result){
        var x = 0;
        if (Object.keys(result).length == 0){
          socket.emit("giveAvaliableUsersForChat", result);
          return;
        }
        for (var key in result){
          cacheIt(key).then(function(user_key){
            result[user_key] = userDict[user_key];
            x++;
            if (x >= Object.keys(result).length){
              socket.emit("giveAvaliableUsersForChat", result);
            }
          });
        }
      })
    });
  });


  socket.on("addUserToChat", function(input){
    var user_id2 = input[0];
    var chat_id = input[1];
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      myDb.isUserInChat(user_id2, chat_id).then(function(isInChat){
        if (isInChat) return;

        myDb.getSpecificUserRelation(user_id, user_id2, true, false, false).then(function(isFriend){
          if (!isFriend) return;

          myDb.addUserToChat(user_id2, chat_id).then(function(){
            socket.emit("addedUserToChat");
          });
        });
      });
    });
  });

  socket.on("getUsersInChat", function(chat_id){
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      if (user_id == null){
        socket.emit("login_alert");
        return;
      }

      myDb.hasChatAccess(chat_id, user_id).then(function(hasAccess){
        if (!hasAccess){
          socket.emit("access_denied");
          return;
        }

        myDb.getUsersInChat(chat_id).then(function(dict){

          cacheNameArray(dict).then(function(dict){
            socket.emit("giveUsersInChat", dict);//dict is {user_id: username}
          }).catch(function(err){
            throw err;
          });
        });
      })
    });
  });


  /*

    Managing messages

   */

  socket.on("get_chat", function(chat_id){// request from a user to get the messages of a chat

    myDb.getUsername(socket.id).then(function(result){
      if (result == null){
        socket.emit('login_alert');
        return;
      }
      myDb.getUserId(result).then(function(result){
        if (result == null)
          return;
        myDb.hasChatAccess(chat_id, result).then(function(result){//returns true if the user has access to the certain chat
          if (result) {
            myDb.getMessages(chat_id, 20).then(function(result){
              cacheMessageArray(result).then(function(data){

                var userArray = data[0];
                var imageData = data[1];
                socket.emit('response', userArray);
                var stream = ss.createStream({objectMode: true});
                ss(socket).emit("give_images", stream);
                stream.write(imageData);
                // var stream = ss.createStream({objectMode: true});
                //
                // ss(socket).emit("give-images", stream);
                //
                // stream.write();
              });
            });
          }
        });
      });
    });
  });



  socket.on("get_more_messages", function(array){
    var chat_id = array[0]
    var message_id = array[1];
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      myDb.hasChatAccess(user_id).then(function(access){
        if (access){
          return;
        }

        myDb.getMessagesRange(chat_id, message_id, 20).then(function(result){
          cacheMessageArray(result).then(function(data){

            var userArray = data[0];
            var imageData = data[1];
            socket.emit('more_message_response', userArray);
            var stream = ss.createStream({objectMode: true});
            ss(socket).emit("give_images", stream);
            stream.write(imageData);

            chatId = chat_id;
          });
        });
      });
    });
  });

  socket.on("removeMessage", function(data){
    var message_id = data[1];
    var chat_id = data[0];

    myDb.getIdFromCookie(socket.id).then(function(user_id){
      myDb.getMessageAuthorId(message_id).then(function(author_id){
        if (author_id != user_id){
          return;
        }

        myDb.removeMessage(message_id);

        var sockets = io.sockets.sockets;

        for(var socketId in sockets)
        {
          var cur_socket = sockets[socketId]; //loop through and do whatever with each connected socket

          updateUserTest(chat_id, cur_socket, "removed_image", [chat_id, message_id]);
        }
      });
    });
  });


  socket.on("chatMessage", function(input){ //user makes a request to add a message if they do, it updates users currently viewing the chat

    // input = [chat_id, message]
    if (input[1].length > 1000){
      return;
    }

    if (input[1].trim().length == 0){
      return;
    }

    input[1] = cleanse(input[1]);

    if (input[1].length > 8192){
      input[1] = input[1].substring(0, 8192);
    }

    myDb.getIdFromCookie(socket.id).then(function(user_id){
      if (user_id == null){
        socket.emit('login_alert');
        return;
      }
      cacheIt(user_id).then(function(){
        myDb.hasChatAccess(input[0], user_id).then(function(result){
          if (result == false) {
            return;
          }
          myDb.updateCookie(user_id);
          myDb.addMessage(user_id, input[0], input[1]).then(function(result){
            var sockets = io.sockets.sockets;
            for(var socketId in sockets)
            {
              var cur_socket = sockets[socketId]; //loop through and do whatever with each connected socket

              // cur_socket.emit('update_chat', input[0]);
              //...
              // updateUser(input[0], cur_socket, [userDict[user_id], input[1]]);
              // console.log(input[1]);
              updateUserTest(input[0], cur_socket, "update_chat", [input[0], userDict[user_id], input[1], result.insertId, user_id]);
            }
            // io.emit("update_chat", input[1]);
          });
        });
      });
    });
  });

  /*
   *
   *
   * Friend Managing
   *
   *
  */

  socket.on("getRelationList", function(relation){
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      if (user_id == null){
        socket.emit("login_alert");
        return;
      }

      myDb.getUserRelation(user_id, relation[0], relation[1] , relation[2], 100).then(function(result){
        var x = 0;
        if (Object.keys(result).length == 0){
          socket.emit("emitRelationList", [relation, result, user_id]);
        }
        for (var key in result){
          cacheIt(key).then(function(user_key){
            result[user_key][0] = userDict[user_key];
            x++;
            if (x >= Object.keys(result).length){
              socket.emit("emitRelationList", [relation, result, user_id]); //result is user_id: [username, requestor] requestor is the person who requested the friend request
            }
          });
        }
      });
    });
  });

  socket.on("get_friendable_users", function(username){




    if (username.trim().length == 0 || (username.charAt(0) == "#" && username.trim().length == 1)){
      socket.emit("friendable_users", "");
      return;
    }

    myDb.getIdFromCookie(socket.id).then(function(user_id){
      myDb.getFriendableUsers(username, user_id, true, false, false).then(function(users){
        socket.emit("friendable_users", users);
      });
    });

    // myDb.getUsersFromName(username).then(function(users){
    //   socket.emit("friendable_users", users);
    // });
  });

  socket.on("acceptFriend", function(friend_id){
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      if (user_id == null){
        socket.emit("login_alert");
        return;
      }
      myDb.setUserRelation(user_id, friend_id, true, false, false);
    })
  });

  socket.on("addFriendRequest", function(request_user_id){
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      if (user_id == null){
        socket.emit("login_alert");
        return;
      }
      myDb.setUserRelation(user_id, request_user_id, false, false, true);
    });
  });

  socket.on("cancelFriend", function(request_user_id){
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      if (user_id == null){
        socket.emit("login_alert");
        return;
      }

      myDb.setUserRelation(user_id, request_user_id, false, false, false);
    });
  })

  socket.on("removeFriend", function(request_user_id){
    myDb.getIdFromCookie(socket.id).then(function(user_id){
      if (user_id == null){
        socket.emit("login_alert");
        return;
      }
      myDb.setUserRelation(user_id, request_user_id, false, false, false).then(function(){
        socket.emit("updateFriendPage");
      });
    });
  });





});

/*

    Helper Functions

*/

function randomLetters(length){ //Helper for adding a cookie
  var numbers = "1234567890";
  var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefhijklmnopqrstuvwxyz1234567890";
  var output = "";
  for (var x = 0; x < length; x++){
    output += letters.charAt(Math.random() * letters.length);
  }

  return output;
}

function cleanse(msg){ //Cleanse the message from potentially hazardous characters

  for (var i = 0; i < msg.length; i++){
    if (msg.charAt(i) == "&"){
      var first = msg.substring(0, i);
      var last = msg.substring(i + 1);
      msg = first + "&amp" + last;
    }
  }


  while (msg.indexOf('"') > -1) {
    msg = msg.replace('"', "&quot;");
  }

  while (msg.indexOf("<") > -1) {
    msg = msg.replace("<", "&lt;");
  }

  while (msg.indexOf(">") > -1) {
    msg = msg.replace(">", "&gt;");
  }

  while (msg.indexOf("\n") > -1){
    msg = msg.replace("\n", "<br>");
  }


  return msg;
}

function returnMessages(mysql_result){
  return new Promise(function(resolve, reject){
    var result = "<ul id='message_list'>";
    // userDict[1] = "admin";
    cacheMySQLArray(mysql_result).then(function(){
      for (var i = mysql_result.length - 1; i > -1; i--){
        result += "<li><table><td class='user' style='vertical-align:top'>" + userDict[mysql_result[i].user_id]+ ":</td><td class='message'>" + mysql_result[i].message + "</td></table></li>";
      }
      result += "</ul>";
      resolve(result);
    });

  });

}

function updateUser(chat_id, cur_socket, message){ //Update the given user's chat
  myDb.getIdFromCookie(cur_socket.id).then(function(user_id){
    if (user_id == null) return;
    myDb.hasChatAccess(chat_id, user_id).then(function(result){
      if (result == true){
        cur_socket.emit("update_chat", [chat_id, message, null, -1, -1]);
      }
    });
  });
}

function updateUserTest(chat_id, cur_socket, event_name, data){
  myDb.getIdFromCookie(cur_socket.id).then(function(user_id){
    if (user_id == null) return;

    myDb.hasChatAccess(chat_id, user_id).then(function(result){
      if (result == true){
        cur_socket.emit(event_name, data);
      }
    });
  })
}

function updateUser2(chat_id, message_id, image_id, cur_socket, message, imageBuffer){
  myDb.getIdFromCookie(cur_socket.id).then(function(user_id){
    if (user_id == null) return;
    myDb.hasChatAccess(chat_id, user_id).then(function(result){
      if (result == true){
        cur_socket.emit("update_chat", [chat_id, message, {imageBuffer}, message_id, image_id]);
      }
    });
  });
}

function updateUser(chat_id, cur_socket, message, imageBuffer){ //Update the given user's chat
  myDb.getIdFromCookie(cur_socket.id).then(function(user_id){
    if (user_id == null) return;
    myDb.hasChatAccess(chat_id, user_id).then(function(result){
      if (result == true){
        cur_socket.emit("update_chat", [chat_id, message, {imageBuffer}, -1, -1]);
      }
    });
  });
}

function cacheIt(user_id){ //caches a map of user_id and username and resolves to the user_id passed in
  return new Promise(function(resolve, reject){
    if (userDict.user_id != undefined) {
      resolve(user_id);
      return;
    }

    myDb.getUsernameId(user_id).then(function(result){
      userDict[user_id] = result;
      resolve(user_id);
    });
  });

}

function cacheMySQLArray(array){
  var x = 0;
  return new Promise(function(resolve, reject){
    if (array.length == 0){
      resolve();
      return;
    }
    for (var i = 0; i < array.length; i++){
      cacheIt(array[i].user_id).then(function(){
        x++;
        if (x == array.length)
          resolve();
      });
    }
  });
}


function cacheMessageArray(array){
  var num = 0;

  return new Promise(function(resolve, reject){
    if (array.length == 0){
      resolve(array);
      return;
    }

    var x = 0;
    var imageData = {};
    for (var i = 0; i < array.length; i++){

      cacheMessageArrayHelper(i, array[i].user_id).then(function(out){// [index, userId]
        array[out[0]].username = userDict[out[1]];
        if (array[out[0]].has_image == 1){
          getFile(array[out[0]].message_id).then(function(data){
            for (var key in data){
              imageData[key] = data[key];
              array[out[0]].image_id = key;
            }
            // imageData[data = data; //{image_id: imageData}
            num++;
            if (num == array.length){
              resolve([array, imageData]);
              return;
            }
          });
        } else {
          num++;
          if (num == array.length){
            resolve([array, imageData]);
            return;
          }
        }


      });
    }
  });
}

function cacheMessageArrayHelper(index, user_id){ //caches the username and then returns the index that was given and the user_id that was just cached

  return new Promise(function(resolve, reject){
    cacheIt(user_id).then(function(){
      resolve([index, user_id]);
    });
  });
}

function cacheNameArray(array){ //array is userid: username
  return new Promise(function(resolve, reject){
    var tot = 0;

    if (Object.keys(array).length == 0){
      resolve(array);
      return;
    }

    for (var key in array){
      cacheIt(key).then(function(user_id){
        array[user_id] = userDict[user_id];
        tot++;
        if (Object.keys(array).length == tot) {
          resolve(array);
        }
      });
    }
  });
}

function getFile(message_id){
  return new Promise(function(resolve, reject){
    myDb.getImage(message_id).then(function(data){// data: {image_id: image_filepath}
      var tot = 0;
      var buffers = {}; //buffers: {image_id: ArrayBuffer}
      for (var image_id in data){
        try {
          getFileHelper(data[image_id], image_id).then(function(newData){
            buffers[newData[0]] = newData[1];
            tot++;
            if (tot == Object.keys(data).length){
              resolve(buffers)
            }
          })
        } catch (error) {
          console.log(error);
        }
      }
    });
  });
}

function getFileHelper(filePath, imageId){
  return new Promise(function(resolve, reject){
    fs.readFile(filePath, (err,data) => {
      // if (err) throw err;

      resolve([imageId, data]);
    });
  });
}

function saveFileHelper(fileData, fileName, oldFileName){
  return new Promise(function(resolve, reject){
    saveFile(fileData, fileName).then(function(buffer){
      resolve([oldFileName, fileName, buffer]);
    })
  });
}



function testGetFile(filePath){
  return new Promise(function(resolve, reject){
    var buffers = {};
    try{
      fs.readFile(filePath, (err, data) => {
        if (err)
          console.log(err);

        buffers[0] = data;
        resolve(buffers);
      });
    } catch (error){

    }
  })
}
