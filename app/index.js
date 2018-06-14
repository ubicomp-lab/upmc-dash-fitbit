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
var connStatus = document.getElementById("connection-status");
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
let timeCounter = 0;
let hrData=0;
let buffer = [];
let lastStepCount = 0;
let curInterval = null; 
let nextInterval = null; 
let miniSteps = 0;
let miniTimer = 0;
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


//prompt sent to the phone
var NOTIFICATION = "Ready?";
var NOTIF_NO_SNOOZE = "Ready!";
var MINIMESSAGE = "Great job!";
var CLOSE = "Close";
// command received from the phone
var SNOOZE = "Snooze";
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
var ONEHOUR = 60;   
var TWOHOURS = 120;  
var ONEMINUTE = 60000;   
var THRESHOLD = 50;
var MINITHRESHOLD = 10;  
var MINITIMELIMIT = 15;   
var SNOOZETIME = 900000; 
var FIVE_MINUTES = 300000;
var MEMORY_UPPERLIMIT = 0.9 * memory.js.total;


// var ONEHOUR = 60;   
// var TWOHOURS = 120;  
// var ONEMINUTE = 6000;   
// var THRESHOLD = 50;
// var MINITHRESHOLD = 10;  
// var MINITIMELIMIT = 10;   
// var SNOOZETIME = 60000; 
// var FIVE_MINUTES = 60000;


// // Suppress the system default action for the "back" physical button
// document.onkeypress = function(e) {
//   e.preventDefault();
//   console.log("Key pressed: " + e.key);
// }


// constantly check: 1)if it's time to start the app; 2)the connection status
setInterval(function() {
  connStatus.text = messaging.peerSocket.readyState == messaging.peerSocket.OPEN ? "(Status: Connected)" : "(Status: Disconnected)";
  stepCount.text = today.adjusted.steps;
  if (!isSessionOn &&  nextInterval!=null && checkTime() ){
    isSessionOn = true;
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
  if(hours%12 == 0 && !isMorning) timeLabel.text = `12:${mins}`;
  else timeLabel.text = `${hours%12}:${mins}`;
}

// Helper function to send normal message
function sendMessage(obj){
  // check if the peerSocket is open
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
  //   messaging.peerSocket.send(obj);
   
    if(buffer.length > 0){
      buffer.push(obj);
      sendBuffer();
    }else{
      messaging.peerSocket.send(obj);
    }  
  }else{
    if(memory.js.used < MEMORY_UPPERLIMIT) buffer.push(obj);
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
  
  // let hour = today.getHours();
  // let min = today.getMinutes();
  // if(startHour < endHour) {
  //   if((hour > startHour && hour < endHour) || (hour == startHour && min >= startMin) || (hour == endHour && min < endMin)) return true;
  //   return false;
  // } else if(startHour > endHour) {
  //   if((hour > endHour && hour < startHour) || (hour == startHour && min < startMin) || (hour == endHour && min >= endMin)) return false;
  //   return true;
  // } else {
  //   if(startMin == endMin) {
  //     return true;
  //   } else if(startMin < endMin) {
  //     if(hour == startHour && min >= startMin && min < endMin) return true;
  //     return false;
  //   } else {
  //     if(hour == startHour && min >= endMin && min < startMin) return false;
  //     return true;
  //   }
  // }
  // return false;
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
        messaging.peerSocket.send(CLOSE);
  }
  let timeStamp = Date.now();
  let response = OKAY;
  sendMessage({timeStamp,response});
}

snoozeButton.onclick = function(evt) {
  console.log("snooze-button is clicked!");
  setMainLayout();
  vibration.stop();
  isSnoozeSet = true;
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        messaging.peerSocket.send(CLOSE);
  }
  snoozeAlarm = setTimeout(function() {
    setMiniSession();
    if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        messaging.peerSocket.send(NOTIF_NO_SNOOZE);
    }
    setResponseLayout(false,RING);
    isSnoozeSet = false;
  },SNOOZETIME); 
  // TO DO: save the timestamp and response to database!!!
  let timeStamp = Date.now();
  let response = SNOOZE;
  sendMessage({timeStamp,response});
}

noButton.onclick = function(evt) {
  console.log("no-button is clicked!");
  vibration.stop();
  showReasonList();
  if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        messaging.peerSocket.send(CLOSE);
  }
  let timeStamp = Date.now();
  let response = NO;
  sendMessage({timeStamp,response});
}

feedbackLayout.onclick = function(evt) {
  setMainLayout();
}


submitButton.onclick = function(evt) {
  setMainLayout();
  let reasons = "";
  checkboxes.forEach(function(element,index){
    if(index == 3 && element.value == 1) {
      if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        messaging.peerSocket.send(OTHER);
      }
    }
    reasons += element.value;
    element.value = 0;
  });
  reasonList.value = 0;
  let timeStamp = Date.now();
  sendMessage({timeStamp, reasons});
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
    let notif = "Ready for a quick walk?";
    sendMessage({timeStamp,notif});
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
    let notif = message;
    sendMessage({timeStamp,notif});
  }
}
function showReasonList() { 
  clearTimeout(alarm);
  mainLayout.style.visibility = "hidden";
  responseLayout.style.visibility="hidden";
  feedbackLayout.style.visibility="hidden";
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
        setMainLayout();
        clearTimeout(alarm);
        if(message.command.trim() == SNOOZE.trim()) {
          if(!isSnoozeSet) {
            snoozeAlarm = setTimeout(function() {
              setMiniSession();
              if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
              messaging.peerSocket.send(NOTIF_NO_SNOOZE);
              }
              setResponseLayout(false,RING);
            },SNOOZETIME);
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
  miniTimer = 0;
}

// Function to start a new session
function startNewSession(){
  
    // initialize the variables/counters
    console.log("The new session starts!");
    timeCounter = 0;
    lastStepCount = 0;
    initialValue = today.adjusted.steps; 
    curInterval = nextInterval;
    clearInterval(handle);
    handle = setInterval(collectData,ONEMINUTE); 
    collectData();

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
  let type = 0;
  let sensorData = diff;
  let data = {timeStamp,type,sensorData};
  if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
  sensorData = hrData;
  type = 4;
  data = {timeStamp,type,sensorData};
  if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
  console.log("Time is: "+timeCounter+", step count is: "+stepData +", diff is: "+diff);       
   // check for mini-session
  if(miniSession) {
    miniSteps = miniSteps + diff;
    if(miniSteps >= MINITHRESHOLD) {     
      miniSession = false;
      if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
         if(checkTime()) messaging.peerSocket.send(MINIMESSAGE);
      }
      type = 3;
      sensorData = miniSteps;
      data = {timeStamp,type,sensorData};
      if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
      setFeedbackLayout(PING,APPRAISAL);
    }
    if(miniTimer == MINITIMELIMIT && miniSession) {    
      miniSession = false;
      type = 3;
      sensorData = miniSteps;
      data = {timeStamp,type,sensorData};
      if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
    }
    miniTimer = miniTimer + 1;  
  }
  // check if the threshold is reached already
  if(stepData >= THRESHOLD) {
    type = curInterval == ONEHOUR? 1:2;
    sensorData = stepData;
    data = {timeStamp,type,sensorData};
    if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
    setMainLayout();
    startNewSession();
    return;
  } 
  // if the current interval ends...
  if(timeCounter === curInterval) {
    //send notification
    if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        if(checkTime()) messaging.peerSocket.send(NOTIFICATION);
    }
    type = curInterval == ONEHOUR? 1:2;
    sensorData = stepData;
    data = {timeStamp,type,sensorData};
    if(checkTime()) sendMessage(JSON.parse(JSON.stringify(data)));
    setResponseLayout(true,RING);
    setMiniSession();
    startNewSession();
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



