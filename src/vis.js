//Author: Nicholas J D Dean
let darkColour = 0;
let midColour = 128;
let textColour = 255;
let accentColour = [255,0,255];
let marLocColour = [0,255,0];
let pcLocColour = [0,0,255];

const connPointSize = 15;
const EFFECT_LIFETIME = 1;
const REGVIEW_WIDTH = 90;

let dataDot;
let views = {};
let sendEffects = [];

let ramConnPoint;

let lastFrameTime;

const canvasWidth = REGVIEW_WIDTH * 3;
let BUS_X = canvasWidth / 2; //place bus in middle of canvas

class RegView {
    constructor(x, y, regID) {
        this.pos = createVector(x, y);
        this.regID = regID;
        this.width = REGVIEW_WIDTH;
        this.height = 70;
    }

    draw() {
        const value = regs[this.regID];
        const {x, y} = this.pos;

        //draw line to bus
        strokeWeight(5);
        line(x, y, BUS_X, y);

        //draw the box
        strokeWeight(0);

        if (this.regID === "pc") {
            fill(pcLocColour);
        }
        else {
            fill(midColour);
        }

        let boxX = x;

        if (x < BUS_X) {
            boxX -= this.width;
        }
        rect(boxX, y - this.height/2, this.width, this.height);

        //draw the connPoint
        fill(accentColour);
        ellipse(x, y, connPointSize, connPointSize);

        //draw the info
        if (value != undefined) {
            textAlign(CENTER);

            if (this.regID === "mar") {
                fill(marLocColour);
            }
            else {
                fill(textColour);
            }
            const boxCenter = boxX + REGVIEW_WIDTH / 2;
            //draw the ID
            text(this.regID.toUpperCase(), boxCenter, y - 15);
            //draw the value
            text(toHexString(value), boxCenter, y + 15);
        }
    }
}

class DataDot {
    constructor(x = 0, y = 0) {
        this.pos = createVector(x, y);
        this.waypoints = [];
        this.callback = null;
    }

    update(frameTime) {
        if (this.waypoints.length > 0) {
            const toWaypoint = p5.Vector.sub(this.waypoints[0],this.pos);
            
            //use magsq for performance
            if (toWaypoint.magSq() < 10) {
                //remove waypoints[0]
                this.waypoints.shift();
                
                //if reached last waypoint, run callback
                if (this.waypoints.length === 0 && this.callback != null) {
                    this.callback();
                }
            }
            else {
                //get direction vector
                toWaypoint.normalize();
                //animSpeed defined in main.js
                toWaypoint.mult(animSpeed * frameTime);
                this.pos.add(toWaypoint);
            }
        }
    }

    draw() {
        //only visible while moving
        if (this.waypoints.length > 0) {
            fill(accentColour);
            ellipse(this.pos.x, this.pos.y, 20, 20);
        }
    }

    init(startPos, callback) {
        this.pos = startPos;
        this.callback = callback;
    }
}


class SendEffect {
    constructor(x, y) {
        this.pos = createVector(x, y);
        this.life = EFFECT_LIFETIME;
    }


    update(frameTime) {
        this.life -= frameTime;
    }


    draw() {
        if (this.life > 0) {
            const brightness = this.life / EFFECT_LIFETIME;
            fill(255,255,255,brightness*255);
            ellipse(this.pos.x, this.pos.y, connPointSize, connPointSize);
        }
    }
}

function setup() {
    const canvas = createCanvas(canvasWidth,700);
    
    //place the canvas in #vis
    canvas.parent("vis")
    
    textFont("monospace");
    textSize(25);
    textAlign(LEFT, TOP);

    strokeWeight(0);

    //get colours from CSS
    const docEl = getComputedStyle(document.documentElement);

    darkColour = docEl.getPropertyValue("--dark");
    midColour = docEl.getPropertyValue("--mid");
    textColour = docEl.getPropertyValue("--text");
    accentColour = docEl.getPropertyValue("--accent");
    marLocColour = docEl.getPropertyValue("--marLoc");
    pcLocColour = docEl.getPropertyValue("--pcLoc");

    dataDot = new DataDot();

    //create all the register views
    const halfLength = REG_IDS.length / 2;
    REG_IDS.forEach((id, index) => {
        const dist = 50;

        let x = BUS_X;
        if (index < halfLength) {
            x += dist;
        }
        else {
            x -= dist;
        }

        const y = 120 + (index % halfLength) * 100;

        views[id] = new RegView(x, y, id);
    });

    //set ram conn point
    ramConnPoint = createVector(BUS_X, 60);

    lastFrameTime = millis();
}


function draw() {
    const ramWidth = 200;
    const time = millis();
    const frameTime = (time - lastFrameTime) / 1000;
    lastFrameTime = time;
    background(darkColour)

    //draw the bus
    push()
    strokeWeight(5);
    line(BUS_X, ramConnPoint.y, BUS_X, 120 + (0.5 * REG_IDS.length - 1) * 100);
    pop()

    //draw all regviews
    for (const view of Object.values(views)) {
        view.draw();
    }

    //draw the ram box
    fill(midColour);
    rect(BUS_X - ramWidth / 2, 0, ramWidth, ramConnPoint.y);
    fill(textColour);
    textAlign(CENTER, CENTER);
    text("RAM", BUS_X, ramConnPoint.y / 2);

    //draw RAM connPoint
    fill(accentColour);
    ellipse(BUS_X, ramConnPoint.y, connPointSize, connPointSize);

    dataDot.update(frameTime);
    dataDot.draw();

    const deadEffects = [];
    //update and draw send effects
    for (let i = 0; i < sendEffects.length; ++i) {
        const effect = sendEffects[i];
        effect.draw()
        effect.update(frameTime);

        if (effect.life <= 0) {
            deadEffects.push(i);
        }
    }

    //remove dead effects
    for (const i of deadEffects) {
        sendEffects.splice(i, i);
    }
}


//takes a callback that will be passed to the dataDot
//which will run it when it reaches its destination
function visualiseCurrentStep(callback) {
    //should only work if not currently visualising something
    const [srcID, srcSpec, dstID] = currInst.c[microIndex];

    //skip animations if they aren't simply from register
    //to register
    const validSource = REG_IDS.includes(srcID) || srcID === "ram";
    const validDest = REG_IDS.includes(dstID) || dstID === "ram";
    if (!validSource || !validDest) {
        callback();
        return;
    }

    //don't allow interupting and ignore alu source
    if (dataDot.waypoints.length === 0) {
        let startPos, endPos;
        
        if (srcID === "ram") {
            startPos = ramConnPoint.copy();
        }
        else {
            startPos = views[srcID].pos.copy();
        }
        
        if (dstID === "ram") {
            endPos = ramConnPoint.copy();
        }
        else {
            endPos = views[dstID].pos.copy();
        }
        
        //add send effect
        sendEffects.push(new SendEffect(startPos.x, startPos.y));

        dataDot.init(startPos, callback);
        
        //add the 3 waypoints
        const w1 = createVector(BUS_X, startPos.y);
        const w2 = createVector(BUS_X, endPos.y);
    
        dataDot.waypoints.push(w1);
        dataDot.waypoints.push(w2);
        dataDot.waypoints.push(endPos);
    }
}


function stopVisualisation() {
    dataDot.waypoints = [];
    dataDot.callback = null;
}