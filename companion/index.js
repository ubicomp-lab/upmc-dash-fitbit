import * as messaging from "messaging";
import { me } from "companion";
import { settingsStorage } from "settings";


// global variables
let command_id = 0;
let nextInfo = "";
let timeSchedule = "";
let isConnectionOn = null;
let isFirstRun = null;
// constant variables
var LOOPINTERVAL_SHORT = 3000;   // we can change the looping interval arbitrarily
var KEY = "first_run";
var ITEM = "done";


// check if this is the first time to run the app
if(settingsStorage.getItem(KEY)==null) {
  console.log("this is the first time we run the app");
  isFirstRun = true;
  settingsStorage.setItem(KEY, ITEM);
} else {
  console.log("this is a reboot");
  isFirstRun = false;
}


// Constantly check: 1)the connection status and update the status to the database; 2)if there's new command sent from the phone
setInterval(function() {
  updateConnStatus();
  checkCommand();
  updateInterval();
  updateSchedule();
}, LOOPINTERVAL_SHORT);

// Listen for the onmessage event
messaging.peerSocket.onmessage = function(evt) {
  let message = evt.data;
  if(typeof message === "string") {
    // if(message.trim() === NOTIFICATION.trim()) {
      console.log("Companion received: "+JSON.stringify(message));
      postData({message},'http://localhost:8080/send_prompt.php');
     // }
  }else {
    if(typeof message.type != "undefined"){
      console.log("Companion received: "+JSON.stringify(message));
      postData(message,'http://localhost:8080/store_data.php');
    } else if(typeof message.reasons != "undefined"){     
      postData(message,'http://localhost:8080/save_reasons.php');
    } else if(typeof message.response != "undefined"){     
      postData(message,'http://localhost:8080/save_response.php');
    } else if(typeof message.notif != "undefined"){
      postData(message,'http://localhost:8080/save_notif.php');
    }
  }
}

function updateInterval() {
  fetch('http://localhost:8080/retrieve_data.php',{ method: 'GET'}).then(function(response) {
        return response.text();     
      }).then(function(text) {
        if(text.trim() != nextInfo.trim()) {
           console.log("Got new survey info from server: "+ text);
           if(messaging.peerSocket.readyState === messaging.peerSocket.OPEN){
              messaging.peerSocket.send(text);
              nextInfo = text;
           }
         }        
      }).catch(function(error) {
        console.log(error); 
      });
}

function updateSchedule() {
  fetch('http://localhost:8080/retrieve_time.php',{ method: 'GET'}).then(function(response) {
        return response.text();     
      }).then(function(text) {
         if(text.trim() != timeSchedule.trim()) {
           console.log("Got new schedule from server: "+ text);
           if(messaging.peerSocket.readyState === messaging.peerSocket.OPEN){
             messaging.peerSocket.send(text);
             timeSchedule = text;
           }
         }        
      }).catch(function(error) {
        console.log(error); 
      });
}

function checkCommand() {
  fetch('http://localhost:8080/check_command.php',{ method: 'GET'}).then(function(response) {
        return response.text();     
      }).then(function(obj) {
        var newObj = JSON.parse(obj);
        let id = newObj["id"];
        let command = newObj["command"];
        if(!isFirstRun) {
          command_id = id; 
          isFirstRun = true;
        }
        if(id>command_id) {
          command_id = id;
          let message = JSON.parse(JSON.stringify({command,command_id}));
          console.log("Got new command from phone: "+command);
          if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
             messaging.peerSocket.send(message);
          }
        }      
      }).catch(function(error) {
        console.log(error); 
      });
}

function updateConnStatus() {
  let curStatus = messaging.peerSocket.readyState == messaging.peerSocket.OPEN ? true:false;
  // console.log("Companion connection status: "+curStatus);
  if(isConnectionOn == null || isConnectionOn != curStatus) {
    isConnectionOn = curStatus;
    let message = curStatus? 1:0;
    console.log("Sent connection status: "+JSON.stringify(message));
    postData({message},'http://localhost:8080/update_conn.php');
  }
}

function postData(obj,link) {
    let init = { 
        method: 'POST', 
        body: JSON.stringify(obj),  
        headers: new Headers()
      };
      fetch(link,init).then(function(response) { 
      return response.text();
      }).then(function(text) {
      console.log("Got response from server!"+text);
      }).catch(function(error) {
      console.log(error);
      });
}


