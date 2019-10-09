var myDb = require("./database");
var colors = require('colors');
var minutes = 5, seconds = 0, interval = (minutes * 60 + seconds) * 1000;

var lastRan = Date.now();
var timeout = [30, 0, 0]; //minutes, seconds, milliseconds
timeout_milliseconds = ((timeout[0] * 60) + timeout[1]) * 1000 + timeout[2];

console.log("initializing: update_logged_users.js".green);


setInterval(function(){
  myDb.removeAFKCookies(timeout_milliseconds);
}, interval);
