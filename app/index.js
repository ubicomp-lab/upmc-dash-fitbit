import clock from "clock";
import document from "document";
import { vibration } from "haptics";
import * as util from "../common/utils";
import { HeartRateSensor } from "heart-rate";
import { today } from 'user-activity';
import * as messaging from "messaging";
import { display } from "display";
import { battery } from "power";
import { charger } from "power";
import { memory } from "system";

// UI elements
var mainLayout = document.getElementById("main-layout");
var responseLayout = document.getElementById("response-layout");
var feedbackLayout = document.getElementById("feedback-layout");
var reasonList = document.getElementById("reason-list");
var timeLabel = document.getElementById("time-label");
var batteryLevel = document.getElementById("battery-percentage");
var batteryIcon = document.getElementById("battery-icon");
// var connStatus = document.getElementById("connection-status");
var snoozeButton =document.getElementById("button-snooze");
var okButton = document.getElementById("button-ok");
var noButton = document.getElementById("button-no");
var tiles = reasonList.getElementsByClassName("tile");
var checkboxes = document.getElementsByClassName("checkbox-item");

var submitButton = document.getElementById("submit-button");
var notifText = document.getElementById("notif-textarea");
var stepCount = document.getElementById("step-count");

// globle variables
let hrm = new HeartRateSensor();
let initialValue = today.adjusted.steps;
let timeCounter = 1;
let hrData=0;
let buffer = [];
let lastStepCount = 0;
let curInterval = null; 
let nextInterval = null; 
let miniSteps = 0;
let miniTimer = 1;
let timeSchedule = null; 
let startHour = null;
let startMin = null;
let endHour = null;
let endMin = null;
let miniSession = false;
let isSessionOn = false;
let handle = null;
let alarm = null;
let snoozeAlarm = null;
let command_id = 0;
let isSnoozeSet = false;
let isNoDisturb = false;
let session_id_old = null;
let session_id_new = null;
var MEMORY_UPPERLIMIT = memory.js.total;

//prompt sent to the phone
var NOTIFICATION = "Ready?";
var NOTIF_NO_SNOOZE = "Ready!";
var MINIMESSAGE = "Great job!";
var CLOSE = "Close";
// command received from the phone
var SNOOZE = "Snooze";
var DO_NOT_DISTURB = "Do Not Disturb On";
var REMOVE_DO_NOT_DISTURB = "Do Not Disturb Off";
// responses to be logged
var OKAY = "Okay";
var NO = "No";
var OTHER = "Other";
// vibration patterns
var PING = "ping";
var RING = "ring";
var APPRAISAL = "Great job being active!";
var BATTERY_WARNING = "Battery low. Please charge your Fitbit.";


var LOOPINTERVAL_SHORT = 3000;   // we can change the looping interval arbitrarily
// var ONEHOUR = 60;   
// var TWOHOURS = 120;  
// var ONEMINUTE = 60000;   
// var THRESHOLD = 50;
// var MINITHRESHOLD = 30;  
// var MINITIMELIMIT = 15;   
// var SNOOZETIME = 900000; 
// var FIVE_MINUTES = 300000;

var ONEHOUR = 60;   
var TWOHOURS = 120;  
var ONEMINUTE = 6000;   
var THRESHOLD = 50;
var MINITHRESHOLD = 30;  
var MINITIMELIMIT = 15;   
var SNOOZETIME = 60000; 
var FIVE_MINUTES = 20000;


// Suppress the system default action for the "back" physical button
document.onkeypress = function(e) {
  e.preventDefault();
  console.log("Key pressed: " + e.key);
}





// constantly check: 1)if it's time to start the app; 2)the connection status
setInterval(function() {
  console.log("now isNoDisturb is: "+isNoDisturb)
  // connStatus.text = messaging.peerSocket.readyState == messaging.peerSocket.OPEN ? "(Status: Connected)" : "(Status: Disconnected)";
  stepCount.text = today.adjusted.steps;
  if (!isSessionOn &&  nextInterval!=null && checkTime() ){
    isSessionOn = true;
    isNoDisturb = false;
    console.log("The real session is on!");
    startNewSession(); 
  }
  // console.log("Watch connected? " + (messaging.peerSocket.readyState == messaging.peerSocket.OPEN ? "YES" : "no"));
}, LOOPINTERVAL_SHORT);







// Update the clock every minute
clock.granularity = "minutes";

clock.ontick = function() {
  updateClock();
}

hrm.onreading = function() {
  hrData = hrm.heartRate ? hrm.heartRate : 0; 
}


// Update the battery status
battery.onchange = function() {
  let percentage = Math.floor(battery.chargeLevel);
  batteryLevel.text = percentage + "%";
  checkBattery(percentage);
}


// Update the current time
function updateClock() {
  let today = new Date();
  let hours = util.zeroPad(today.getHours());
  let mins = util.zeroPad(today.getMinutes());
  let isMorning = (hours/12)==0; 
  if(((hours%12) == 0) && (!isMorning)) timeLabel.text = `12:${mins}`;
  else timeLabel.text = `${hours%12}:${mins}`;
}

// Helper function to send normal message
function sendMessage(obj){
  // check if the peerSocket is open
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
    if(buffer.length > 0){
      buffer.push(obj);
      sendBuffer();
    }else{
      messaging.peerSocket.send(obj);
    }  
  }else{
    if(memory.js.used < 0.5*MEMORY_UPPERLIMIT) {
      // skip the "0"s of the step counter per min
      if(!(obj.type == 2 && obj.sensorData == 0)) buffer.push(obj);
    } else if(memory.js.used < 0.9*MEMORY_UPPERLIMIT){
      // skip logging SC and HR per min, and notifications
      if(obj.type != 2 && obj.type !=4 && obj.notif == "undefined") buffer.push(obj);
    }
  }
}
// Helper function to send buffered data
function sendBuffer(){
  if (messaging.peerSocket.bufferedAmount < 128 && buffer.length > 0){
    messaging.peerSocket.send(buffer[0]);
    buffer.splice(0, 1); 
    setTimeout(sendBuffer,1);  // use setTimeout to break the operation down into chunks and chain them together(in case the app gets terminated by the os)
  }
}

// Listen for the onbufferedamountdecrease event
messaging.peerSocket.onbufferedamountdecrease = function() {
  // Amount of buffered data has decreased, continue sending data
  if(messaging.peerSocket.readyState === messaging.peerSocket.OPEN){
  sendBuffer();
  }
}

// function to check if the current time is within the time schedule
function checkTime() {
  if(timeSchedule==null) return false;
  let today = new Date();
  let morningTime = new Date();
  let eveningTime = new Date();
  morningTime.setHours(startHour);
  morningTime.setMinutes(startMin);
  eveningTime.setHours(endHour);
  eveningTime.setMinutes(endMin);
  if(startHour > endHour){
    if(today < eveningTime || today >= morningTime) return true;
  } else {
    if(today >= morningTime && today < eveningTime) return true;
  }
  return false;
}



function checkBattery(percentage){
  if(charger.connected) {
    batteryIcon.href = "battery_charge.png";
    batteryIcon.style.fill = "yellow";
    return;
  }
  if(percentage > 90){
    batteryIcon.href = "battery_full.png";
    batteryIcon.style.fill = "green";
  } else if(percentage >= 65 && percentage <= 90){
    batteryIcon.href = "battery_75.png";
    batteryIcon.style.fill = "green";
  } else if(percentage > 40 && percentage < 65) {
    batteryIcon.href = "battery_half.png"
    batteryIcon.style.fill = "green";
  } else if(percentage >10 && percentage <= 40) {
    batteryIcon.href = "battery_low.png";
    if(percentage <= 25) {
      batteryIcon.style.fill = "red";
      setFeedbackLayout(PING,BATTERY_WARNING);
    }else{
      batteryIcon.style.fill = "green";
    }
  } else {
    batteryIcon.href = "battery_empty.png";
    batteryIcon.style.fill = "red";
  }
}




// -----------------------------------------------a series of onclick event listeners-------------------------------------------------
okButton.onclick = function(evt) {
  console.log("ok-button is clicked!");
  setMainLayout();
  vibration.stop();
  // TO DO: save the timestamp and response to database!!!
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        let  prompt = CLOSE;
        let sessionId = session_id_old;
        messaging.peerSocket.send({prompt,sessionId});
  }
  let timeStamp = Date.now();
  let response = OKAY;
  let sessionId = session_id_old;
  sendMessage({timeStamp,sessionId, response});
}

snoozeButton.onclick = function(evt) {
  console.log("snooze-button is clicked!");
  setMainLayout();
  vibration.stop();
  isSnoozeSet = true;
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        let  prompt = CLOSE;
        let sessionId = session_id_old;
        messaging.peerSocket.send({prompt,sessionId});
  }
  snoozeAlarm = setTimeout(function() {
    setMiniSession();
    if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        let  prompt = NOTIF_NO_SNOOZE;
        let sessionId = session_id_old;
        messaging.peerSocket.send({prompt,sessionId});
    }
    setResponseLayout(false,RING);
    isSnoozeSet = false;
  },SNOOZETIME); 
  // TO DO: save the timestamp and response to database!!!
  let timeStamp = Date.now();
  let sessionId = session_id_old;
  let response = SNOOZE;
  sendMessage({timeStamp,sessionId, response});
}

noButton.onclick = function(evt) {
  console.log("no-button is clicked!");
  vibration.stop();
  showReasonList();
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        let  prompt = CLOSE;
        let sessionId = session_id_old;
        messaging.peerSocket.send({prompt,sessionId});
  }
  let timeStamp = Date.now();
  let sessionId = session_id_old;
  let response = NO;
  sendMessage({timeStamp,sessionId, response});
}

feedbackLayout.onclick = function(evt) {
  setMainLayout();
}


submitButton.onclick = function(evt) {
  setMainLayout();
  let reasons = "";
  checkboxes.forEach(function(element,index){
    if(index == 4 && element.value == 1) {
      if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        let  prompt = OTHER;
        let sessionId = session_id_old;
        messaging.peerSocket.send({prompt,sessionId});
      }
    }
    reasons += element.value;
    element.value = 0;
  });
  reasonList.value = 0;
  let timeStamp = Date.now();
  let sessionId = session_id_old;
  sendMessage({timeStamp, sessionId, reasons});
}
// --------------------------------------------------functions to set layouts-----------------------------------------------------------------------


function setMainLayout() { 
  mainLayout.style.visibility = "visible";
  responseLayout.style.visibility="hidden";
  feedbackLayout.style.visibility="hidden";
  reasonList.style.visibility = "hidden";
}


function setResponseLayout(snoozeOption,vibraPattern) {
  clearTimeout(alarm);
  if(checkTime()) {
    display.on = true; // turn on the screen
    snoozeButton.style.display = snoozeOption? "inline":"none";
    mainLayout.style.visibility = "hidden";
    responseLayout.style.visibility="visible";
    feedbackLayout.style.visibility="hidden";
    reasonList.style.visibility = "hidden";
    vibration.start(vibraPattern);
    alarm = setTimeout(setMainLayout,FIVE_MINUTES);
    let timeStamp = Date.now();
    let sessionId = session_id_old;
    let notif = snoozeOption? 1:2;
    sendMessage({timeStamp, sessionId, notif});
  }
}


function setFeedbackLayout(vibraPattern,message) {
  clearTimeout(alarm);
  clearTimeout(snoozeAlarm);
  if(checkTime()) {
    display.on = true;
    mainLayout.style.visibility = "hidden";
    responseLayout.style.visibility="hidden";
    feedbackLayout.style.visibility="visible";
    reasonList.style.visibility = "hidden";
    notifText.textContent= message;
    vibration.start(vibraPattern);
    alarm = setTimeout(setMainLayout,FIVE_MINUTES);
    let timeStamp = Date.now();
    let sessionId = session_id_old;
    let notif = message == APPRAISAL? 0:3;
    sendMessage({timeStamp,sessionId,notif});
  }
}
function showReasonList() { 
  clearTimeout(alarm);
  mainLayout.style.visibility = "hidden";
  responseLayout.style.visibility="hidden";
  feedbackLayout.style.visibility="hidden";
  checkboxes.forEach(function(element,index){
    element.value = 0;
  });
  reasonList.value = 0;
  reasonList.style.visibility = "visible";
  alarm = setTimeout(setMainLayout,ONEMINUTE);
}



// --------------------------------------------------------------------------------------------------------------------------------------


// Listen for the message from companion phone
messaging.peerSocket.onmessage = function(evt) {
  let message = evt.data;
  if(typeof message === "string") {
    console.log("Watch received: "+message);
    if(message.trim() === ">=7".trim() ) {
      console.log("Next interval has been changed to two hours");
      nextInterval = TWOHOURS;    
    } else if(message.trim() === "<7".trim() ){
      console.log("Next interval has been changed to one hour");
      nextInterval = ONEHOUR;     
    } else{
      timeSchedule = message;  // like "07002030",etc.
      startHour = parseInt(timeSchedule.substr(0,2));
      startMin = parseInt(timeSchedule.substr(2,2));
      endHour = parseInt(timeSchedule.substr(4,2));
      endMin = parseInt(timeSchedule.substr(6,2));
    }
  } else {
      if(message.command_id > command_id) {
        command_id = message.command_id;
        console.log("Now command_id is: " + command_id + " "+message.command);
        if(message.command.trim() == DO_NOT_DISTURB.trim()) {
          isNoDisturb = true;
          console.log(isNoDisturb);
        }else if(message.command.trim() == REMOVE_DO_NOT_DISTURB.trim()) {
          isNoDisturb = false;
        }else {
          setMainLayout();
          clearTimeout(alarm);
          if(message.command.trim() == SNOOZE.trim()) {
            if(!isSnoozeSet) {
              snoozeAlarm = setTimeout(function() {
                setMiniSession();
                if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
                  let  prompt = NOTIF_NO_SNOOZE;
                  let sessionId = session_id_old;
                  messaging.peerSocket.send({prompt,sessionId});
                }
                setResponseLayout(false,RING);
              },SNOOZETIME);
            }
          } 
        }
      }
   }
}


// ------------------------------------------------main algorithms--------------------------------------------------------------------

//function to set the mini-sessions
function setMiniSession() {
  console.log("Mini-session starts!");
  miniSession = true;
  miniSteps = 0;
  miniTimer = 1;
}

// Function to start a new session
function startNewSession(){
    // generate a new uuid for the new session
    session_id_old = session_id_new;
    session_id_new = util.guid();
    // initialize the variables/counters
    console.log("The new session starts!");
    timeCounter = 1;
    lastStepCount = 0;
    initialValue = today.adjusted.steps; 
    curInterval = nextInterval;
    clearInterval(handle);
    handle = setInterval(collectData,ONEMINUTE); 
    // collectData();

}

// function to log data and send it to phone
function collectData() { 
  if(checkTime()){
  let stepData = today.adjusted.steps-initialValue;
  let diff = stepData - lastStepCount;
  if(stepData < 0) {
    stepData = today.adjusted.steps;
    diff = today.adjusted.steps;
    initialValue = 0; 
  } 
  let timeStamp = Date.now();
  let type = 2;
  let sensorData = diff;
  let sessionId = session_id_new;
  let data = {timeStamp,sessionId,type,sensorData};
  if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
  sensorData = hrData;
  type = 4;
  data = {timeStamp,sessionId,type,sensorData};
  if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
  console.log("Time is: "+timeCounter+", step count is: "+stepData +", diff is: "+diff);       
   // check for mini-session
  if(miniSession) {
    sessionId = session_id_old;
    miniSteps = miniSteps + diff;
    if(miniSteps >= MINITHRESHOLD) {     
      miniSession = false;
      if(!isNoDisturb){
        if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
          let  prompt = MINIMESSAGE;
          if(checkTime()) messaging.peerSocket.send({prompt,sessionId});
        }
      }
      type = 3;
      sensorData = miniSteps;
      data = {timeStamp,sessionId,type,sensorData};
      if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
      if(!isNoDisturb){
        setFeedbackLayout(PING,APPRAISAL);
      }
    }
    if(miniTimer == MINITIMELIMIT && miniSession) {    
      miniSession = false;
      type = 3;
      sensorData = miniSteps;
      data = {timeStamp,sessionId,type,sensorData};
      if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
    }
    miniTimer = miniTimer + 1;  
  }
  // check if the threshold is reached already
  sessionId = session_id_new;
  if(stepData >= THRESHOLD) {
    startNewSession();
    type = curInterval == ONEHOUR? 0:1;
    sensorData = stepData;
    data = {timeStamp,sessionId,type,sensorData};
    if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
    setMainLayout();
    return;
  } 
  // if the current interval ends...
  if(timeCounter === curInterval) {
    startNewSession();
    //send notification
    if(!isNoDisturb){
      if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        let  prompt = NOTIFICATION;
        messaging.peerSocket.send({prompt,sessionId});
      }
    }
    type = curInterval == ONEHOUR? 0:1;
    sensorData = stepData;
    data = {timeStamp,sessionId,type,sensorData};
    if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
    if(!isNoDisturb) {
      console.log("look here: "+isNoDisturb);
      setResponseLayout(true,RING);
    }
    setMiniSession();
    return;
  }
  lastStepCount = stepData;
  timeCounter = timeCounter +1;
} else{
  isSessionOn = false;
  clearInterval(handle);
  console.log("Sleeping mode...");
}
} 


// Initialize the app...
setMainLayout();
hrm.start();
batteryLevel.text = Math.floor(battery.chargeLevel) + "%";
checkBattery(Math.floor(battery.chargeLevel));

