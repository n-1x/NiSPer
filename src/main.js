//Author: Nicholas J D Dean
//functions that are called by the proxy
//when writing to or reading from ram
const ramProxyHandler = {
    get (target, offset) {
        return target[offset];
    },

    set (target, offset, value) {
        if (isNaN(value) || value < 0) {
            value = 0;
        }
        else if (value >= OVERFLOW_VAL) {
            value %= OVERFLOW_VAL;
        }

        const offsetVal = parseInt(offset);

        if (offsetVal >= 0 && offsetVal < MEMORY_SIZE) {
            target[offset] = value;
        }
        
        //if word is visible in editor, update the hexEditor as well
        if (getPositionInEditor(offsetVal) != null) {
            const index = offsetVal - hexEditStartLine * HEXEDIT_WPL;

            if (els.hex.length > 0) {
                els.hex[index].value = toHexString(value);
                updateText(index, value);
            }
        }

        if (opcodes != undefined) {
            updateDasm(offsetVal);
        }
    }
};


//functions called by the proxy when writing
//to or reading from the registers
const regsProxyHandler = {
    get (target, regID) {
        return target[regID];
    },

    set (target, regID, value) {
        if (isNaN(value) || value < 0) {
            value = 0;
        }
        else if (value >= OVERFLOW_VAL) {
            value %= OVERFLOW_VAL;
        }

        target[regID] = value;

        //update the text box
        els[regID].value = toHexString(value);
        //update the highlighted word in hexEditor
        updateHighlights(regID);
    }
};

//word size in bits
const WORD_SIZE = 0x10;

//value at which a number has overflowed
const OVERFLOW_VAL = Math.pow(2, WORD_SIZE);

//memory size in words
const MEMORY_SIZE = 0x1000;

//need to know halt instruction
const OP_HALT = 0xf0;

//Memory mapped IO locations
const MMIO_IDR = 0xe0;
const MMIO_ISR = 0xe1;
const MMIO_ODR = 0xe2;
const MMIO_OSR = 0xe3;

//time subsystem locations
const CLOCK_BASE_ADDR = 0xe8;

//base address for interrupts
const INT_BASE = 0xf0;

//hexedit words per line
//needs to be linked to the css style rule
//.hexEditor span:nth-of-type(8n):after 
const HEXEDIT_WPL = 8;
const HEXEDIT_NUM_LINES = 18;

//the default character in the text section of the hex editor 
const HEXEDIT_EMPTY_CHAR = '.';

//holds references to certain html elements
const els = {};

const ram = new Proxy([], ramProxyHandler);
const regs = new Proxy({}, regsProxyHandler);

const REG_IDS = [
    "pc", "inc", "ir", "sp", "a", "b", "mar", 
    "mdr", "alux", "aluy", "alur", "psr"
];

//each alu operation's character
const ALU_OPS = {
    ADD:  '+',
    ADDC: 'c+',
    SUB:  '-',
    SHL:  '<',
    SHR:  '>',
    AND:  '&',
    OR:   '|',
    NOT:  '~',
    INC:  'i',
    DEC:  'd',
    SWAP: '^'
};

//specifiers for locations in a word
const SPECS = {
    ALL:   '',
    BYTE1: '1',
    BYTE2: '2',
    VBIT:  'v',
    NBIT:  'n',
    ZBIT:  'z',
    CBIT:  'c',
    IBIT:  'i',
    EBIT:  'e',
    INTVEC: 'int',
    VALUE: "#"
};


//meanings for each of the psr bits
const PSR_I   = 0b0010000000000000;
const PSR_E   = 0b0001000000000000;
const PSR_INT = 0b0000011100000000;
const PSR_V   = 0b0000000000001000;
const PSR_N   = 0b0000000000000100;
const PSR_Z   = 0b0000000000000010;
const PSR_C   = 0b0000000000000001;

const ANIM_SPEED_SLOW = 100;
const ANIM_SPEED_MID = 200;
const ANIM_SPEED_FAST = 350;

let currInst;                   //current instruction
let microIndex = 0;             //counter for the current micro instruction
let haltAfterTick = false;      //will halt after current tick
let haltAfterFetch = false;     //will halt after fetch 
let haltAfterExecute = false;   //will halt after execute
let animEnabled = true;         //animate each tick
let lastKeyPressed = null;      //last key pressed while focused on stdio
let hexEditStartLine = 0;       //current scroll position of hex editor
let dasmStartLine = 0;          //current scroll position of dasm
let animSpeed = ANIM_SPEED_MID; //speed of animation if enabled

let opcodes; //will hold all the opcodes, descriptions and mnemonics

//highlightLocs are relative to the html elements,
//not the position in memory. So they must be stored
//separately for each section that has highlights.
//E.G pc: 1 means that the second hex element
const ramHighlightLocs = {
    pc: 0,
    mar: 0
};

const dasmHighlightLocs = {
    pc: 0,
    mar: 0
}


function toggleAnimation() {
    if (!animEnabled) {
        animEnabled = true;
        animSpeed = ANIM_SPEED_SLOW;
        animButton.innerText = "Anim: Slow";
    }
    else if (animSpeed === ANIM_SPEED_SLOW) {
        animSpeed = ANIM_SPEED_MID;
        animButton.innerText = "Anim: Med";
    }
    else if (animSpeed === ANIM_SPEED_MID) {
        animSpeed = ANIM_SPEED_FAST;
        animButton.innerHTML = "Anim: Fast";
    }
    else {
        animEnabled = false;
        animButton.innerHTML = "Anim: None";
    }
}


function toggleHelp() {
    if (help.classList.contains("hidden")) {
        help.classList.remove("hidden");
    }
    else {
        help.classList.add("hidden");
    }
}


//tick the cpu once then halt
function runStep() {
    haltAfterTick = true;
    tick();
}


//run a fetch instruction then halt
function runFetch() {
    currInst = opcodes.fetch;
    microIndex = 0;
    haltAfterFetch = true;
    haltAfterTick = false;
    setStateText("Fetch");
    tick();
}


//run the current instruction then hald
function runExecute() {
    currInst = opcodes[(regs.ir & 0xff00) >> 8];
    microIndex = 0;
    haltAfterExecute = true;
    haltAfterTick = false;
    setStateText(getDisassembly(regs.ir));
    tick();
}


//runs a whole fetch execute cycle then halt
function runCycle() {
    currInst = opcodes.fetch;
    microIndex = 0;
    haltAfterExecute = true;
    haltAfterTick = false;
    setStateText("Fetch");
    tick();
}


//runs the program until halt
function runUntilHalt() {
    const answer = confirm("WARNING: this feature runs " +
    "programs much faster, but it will freeze the app until a halt " + 
    "instruction is reached. If your program doesn't halt, the page " +
    "must be refreshed.\nPress okay to accept.");

    if (answer) {
        while (!haltAfterTick) {
            processStep();
        }
    }
}


//starts or skips the visualiser, then ticks the
//cpu and calls its self until haltAfterTick is true
function tick() {
    const done = () => {
        //tick the CPU
        processStep();

        //if interrupt flag and interrupts enabled
        if (getSourceValue("psr", "i") === 1 && 
            getSourceValue("psr", "e") === 1) {
            setStateText("Interrupt");
            currInst = opcodes.interrupt;
            microIndex = 0;
        }

        if (!haltAfterTick) {
            tick();
        }
        else {
            haltAfterTick = false;
        }
    };

    //visualisation step. Should call done when done
    if (animEnabled) {
        visualiseCurrentStep(done);
    }
    else {
       setTimeout(done, 0);
    }
}


//runs one step of the current instruction
//if the instruction ends, it sets up the next
//instruction
function processStep() {
    if (microIndex < currInst.c.length) {
        //skip empty instructions like NOP or HALT
        //the first microcode is the only one that
        //is vaid if empty
        if (currInst.c[0].length !== 0) {
            runMicrocode(currInst.c[microIndex]);
        }
        ++microIndex;
    }
    
    //if the current instruction has now completed
    if (microIndex >= currInst.c.length) {
        microIndex = 0;
        
        //finished execute, switch to fetch
        if (currInst !== opcodes.fetch) {
            if (haltAfterExecute) {
                haltAfterExecute = false;
                haltAfterTick = true;
            }
            
            currInst = opcodes.fetch;
            setStateText("Fetch");
        }
        else { //finished fetch, switch to execute
            const opcode = (regs.ir & 0xff00) >> 8;
            const codeStr = opcode.toString(16).toUpperCase();

            //halt and catch fire
            if (opcode === OP_HALT) {
                haltAfterTick = true;
            }

            if (haltAfterFetch) {
                haltAfterTick = true;
                haltAfterFetch = false;
            }
            
            //switch to the next instruction
            const instruction = opcodes[opcode];
            
            if (instruction != undefined) {
                currInst = instruction;
                setStateText(getDisassembly(regs.ir));
            }
            else {
                setStateText(`Unknown Opcode ${codeStr}`);
                haltAfterTick = true;
            }
        }
    }

    //handle MMIO output
    if (ram[MMIO_OSR] === 0) {
        ram[MMIO_OSR] = 1;
    }
    else if (ram[MMIO_ODR] !== 0 && ram[MMIO_OSR] === 1) {
        stdout(String.fromCharCode(ram[MMIO_ODR]));
        ram[MMIO_ODR] = 0;
        ram[MMIO_OSR] = 0;
    }

    //handle MMIO_INPUT
    if (lastKeyPressed != null) {
        ram[MMIO_IDR] = lastKeyPressed;
        lastKeyPressed = null;
    }
    else if (ram[MMIO_ISR] !== 0) {
        ram[MMIO_ISR] = 0;
    }

    //update time values in memory
    const date = new Date();
    ram[CLOCK_BASE_ADDR] = date.getSeconds();
    ram[CLOCK_BASE_ADDR + 1] = date.getMinutes();
    ram[CLOCK_BASE_ADDR + 2] = date.getHours();
    ram[CLOCK_BASE_ADDR + 3] = date.getDate();
    ram[CLOCK_BASE_ADDR + 4] = date.getMonth();
    ram[CLOCK_BASE_ADDR + 5] = date.getFullYear();

    const timerAddr = CLOCK_BASE_ADDR + 6;
    //very simple timer, probably not to specification
    if (ram[timerAddr] > 0) {
        --ram[timerAddr];
    }
}


function getSourceValue(id, spec) {
    let value = regs[id];

    switch (spec) {
        case SPECS.ALL: //do nothing
            break;

        case SPECS.BYTE1: //only byte 1 
            value = (value & 0xff00) >> 8;
            break;

        case SPECS.BYTE2: //only byte 2
            value = value & 0xff;
            break;

        case SPECS.IBIT: //interrupt bit
            value = (value & PSR_I) >> 13;
            break;

        case SPECS.EBIT: //interrupts enabled flag
            value = (value & PSR_E) >> 12;
            break;

        case SPECS.INTVEC: //interrupt vector
            value = (value & PSR_INT) >> 8;
            break;

        case SPECS.VBIT: //overflow bit
            value = (value & PSR_V) >> 3;
            break;

        case SPECS.NBIT: //negative bit
            value = (value & PSR_N) >> 2;
            break;

        case SPECS.ZBIT: //zero bit
            value = (value & PSR_Z) >> 1;
            break;

        case SPECS.CBIT: //carry bit
            value = value & PSR_C;
            break;

        default:
            console.error("Unknown source specifier");
    }

    return value;
}


//writes srcValue to a specific byte range in regs[dstID]
//based on the dstSpec
function writeToDestWithSpec(dstID, dstSpec, srcValue) {
    if (dstID === "inc") {
        srcValue = (srcValue + 1) % OVERFLOW_VAL;
    }

    switch(dstSpec) {
        case SPECS.ALL: //change nothing
            regs[dstID] = srcValue;
            break;

        case SPECS.BYTE1: //only byte 1 
            //mask src value for safety
            srcValue &= 0xff;
            //set first byte to zero
            regs[dstID] &= 0x00ff;
            //write new value
            regs[dstID] |= srcValue << 8;
            break;

        case SPECS.BYTE2: //only byte 2
            //mask src value for safety
            srcValue &= 0xff;
            //set second byte to zero
            regs[dstID] &= 0xff00;
            //write new value
            regs[dstID] |= srcValue;
            break;

        case SPECS.IBIT: //interrupt bit
            srcValue &= 1;
            //set the bit to zero
            regs[dstID] &= 0xffff - PSR_I;

            regs[dstID] |= srcValue << 13;
            break;

        case SPECS.EBIT: //interrupts enabled flag
            srcValue &= 1;
            //set the bit to zero
            regs[dstID] &= 0xffff - PSR_E;

            regs[dstID] |= srcValue << 12;
            break;

        case SPECS.INTVEC: //interrupt vector
            srcValue &= 0b111;
            //set the bit to zero
            regs[dstID] &= 0xffff - PSR_INT;

            regs[dstID] |= srcValue << 8;
            break;

        case SPECS.VBIT: //overflow bit
            //mask src value for safety
            srcValue &= 1;
            //set second byte to zero
            regs[dstID] &= 0xffff - PSR_V;
            //write new value
            regs[dstID] |= srcValue << 3;
            break;

        case SPECS.NBIT: //negative bit
            //mask src value for safety
            srcValue &= 1;
            //set second byte to zero
            regs[dstID] &= 0xffff - PSR_N;
            //write new value
            regs[dstID] |= srcValue << 2;
            break;

        case SPECS.ZBIT: //zero bit
            //mask src value for safety
            srcValue &= 1;
            //set second byte to zero
            regs[dstID] &= 0xffff - PSR_Z;
            //write new value
            regs[dstID] |= srcValue << 1;
            break;

        case SPECS.CBIT: //carry bit
            //mask src value for safety
            srcValue &= 1;
            //set second byte to zero
            regs[dstID] &= 0xffff - PSR_C;
            //write new value
            regs[dstID] |= srcValue;
            break;

        default:
            console.error("Unknown dest specifier: " + dstSpec);
    }
}


//performs the operation specified by spec
//negate, mult, div and mod are all not located
//in the instruction set so are unimplemented
function aluOperation(spec) {
    let vBit = 0, cBit = 0, result;

    switch (spec) {
        case ALU_OPS.ADD: //add
            result = regs.alux + regs.aluy;

            if (result >= OVERFLOW_VAL) {
                result %= OVERFLOW_VAL;
                cBit = 1;
            }

            vBit = overflowCheck(regs.alux, regs.aluy, result);;
            regs.alur = result;
            break;

        case ALU_OPS.ADDC: //add carry
            result = regs.alux + regs.aluy + getSourceValue("psr", "c");
            
            if (result >= OVERFLOW_VAL) {
                result %= OVERFLOW_VAL;
                cBit = 1;
            }
        
            vBit = overflowCheck(regs.alux, regs.aluy, result);;
            regs.alur = result;
            break;

        case ALU_OPS.SUB: //sub
            result = regs.alux - regs.aluy;

            if (result < 0) {
                result += OVERFLOW_VAL;
                cBit = 1;
            }

            vBit = overflowCheck(regs.alux, regs.aluy, result);
            regs.alur = result;
            break;

        case ALU_OPS.SHL: //shift left
            cBit = (regs.alux & 0x8000) >> 15;
            regs.alur = (regs.alux << 1) & 0xffff;
            break;

        case ALU_OPS.SHR: //shift right
            cBit = regs.alux & 1;
            regs.alur = regs.alux >> 1;
            break;

        case ALU_OPS.AND: //and
            regs.alur = regs.alux & regs.aluy;
            break;

        case ALU_OPS.OR: //or
            regs.alur = regs.alux | regs.aluy;
            break;

        case ALU_OPS.NOT: //not
            regs.alur = 0xffff - regs.alux;
            break;
        
        case ALU_OPS.INC: //inc
            result = regs.alux + 1;

            if (result >= OVERFLOW_VAL) {
                result %= OVERFLOW_VAL;
                cBit = 1;
            }

            regs.alur = result;
            //test with positive number
            vBit = overflowCheck(regs.alux, 0, result);
            break;

        case ALU_OPS.DEC: //dec
            result = regs.alux - 1;

            if (result < 0) {
                result +=  OVERFLOW_VAL;
                cBit = 1;
            }
            regs.alur = result;
            //test with negative number
            vBit = overflowCheck(regs.alux, 0xffff, result);
            break;

        case ALU_OPS.SWAP: //swap
            //use result as temporary variable
            result = getSourceValue("alux", "1");

            writeToDestWithSpec("alur", "1", getSourceValue("alux", "2"));
            writeToDestWithSpec("alur", "2", result);
            break;

        default:
            console.error("Unknown ALU specifier: " + spec);
    }

    //update the PSR
    const nBit = (regs.alur & 0x8000) >> 15; //msb of alur
    const zBit = regs.alur === 0 ? 1 : 0;
    writeToDestWithSpec("psr", "v", vBit);
    writeToDestWithSpec("psr", "n", nBit);
    writeToDestWithSpec("psr", "z", zBit);
    writeToDestWithSpec("psr", "c", cBit);
}


//checks for twos complement overflow
//between two numbers and the result of their
//calculation
function overflowCheck(x, y, result) {
    const xPolarity = (x & 0x8000) != 0;
    const yPolarity = (y & 0x8000) != 0;
    const resultPolarity = (result & 0x8000) != 0;
    const overflowed = (xPolarity === yPolarity) && 
                     (resultPolarity !== xPolarity);

    return overflowed;
}


function runMicrocode(microcode) {
    const [srcID, srcSpec, dstID, dstSpec] = microcode;

    //special cases
    if (srcSpec === SPECS.VALUE) {
        //write a literal value held in srcID
        //IB is a code for the interrupt base address
        if (srcID === "IB") {
            writeToDestWithSpec(dstID, dstSpec, INT_BASE);
        }
        else {
            writeToDestWithSpec(dstID, dstSpec, parseInt(srcID, 16));
        }
    }
    else if (srcID === "ram") { //read from ram
        const val = ram[regs.mar];
        writeToDestWithSpec(dstID, dstSpec, val);
    }
    else if (dstID === "ram") { //write to ram
        ram[regs.mar] = regs[srcID];
    }
    else if (srcID === "alu") { //alu operation
        aluOperation(srcSpec);
    }
    else if (srcID === "?psr") { //query psr
        const psrVal = getSourceValue("psr", "z");

        if (psrVal !== parseInt(dstID)) {
            //this will cause the current instruction to end
            //if the test was unsuccessful
            microIndex = currInst.c.length;
        }
    }
    else { //standard case
        const srcVal = getSourceValue(srcID, srcSpec);
        writeToDestWithSpec(dstID, dstSpec, srcVal);
    }
}


//returns the position in the editor's grid of the given
//memory offset. Null if not visible.
function getPositionInEditor(offset) {
    let ans = offset;

    ans -= hexEditStartLine * HEXEDIT_WPL;

    if (ans < 0 || ans >= HEXEDIT_NUM_LINES * HEXEDIT_WPL) {
        ans = null;
    }

    return ans;
}


//updates the text section of the hex editor
//with the ASCII character matching the value
//in its corresponding location in RAM
function updateText(index, val) {
    if (val >= 32 && val <= 126) {
        els.text[index].innerHTML = String.fromCharCode(val);
    }
    else {
        els.text[index].innerHTML = HEXEDIT_EMPTY_CHAR;
    }
}


//handler for the scroll event on the hex editor
function scrollHexEditor(e) {
    const up = e.deltaY < 0;
    const nodes = hexEditor.childNodes;

    if (up && hexEditStartLine > 0) {
        --hexEditStartLine;
    }
    else if (!up && hexEditStartLine + HEXEDIT_NUM_LINES < MEMORY_SIZE / HEXEDIT_WPL){
        ++hexEditStartLine;
    }

    //for each line, change the contents to show
    //what they should now represent
    const elsPerLine = 1 + (HEXEDIT_WPL * 2);
    for (let lineNum = 0; lineNum < HEXEDIT_NUM_LINES; ++lineNum) {
        const index = lineNum * elsPerLine;

        //update offset
        const spanVal = (lineNum + hexEditStartLine) * (HEXEDIT_WPL);
        nodes[index].innerHTML = toHexString(spanVal);

        //udpate hex & text
        for (let x = 0; x < HEXEDIT_WPL; ++x) {
            const val = ram[spanVal + x];

            nodes[index + x + 1].value = toHexString(val);
            updateText(lineNum * HEXEDIT_WPL + x, val);
        }
    }

    //move the ram highlight locs
    updateHighlights();
}


//get the disassembly for a given
//16 bit word
function getDisassembly(word) {
    const opcode = (word & 0xff00) >> 8;
    const operand = word & 0xff;
    const valueString = toHexString(operand, 2);

    let mnemonic = "UNKNOWN";

    if (opcodes[opcode] != undefined) {
        mnemonic = opcodes[opcode].m;
    }

    //replace the word data with the data segment
    mnemonic = mnemonic.replace("#data", valueString + 'h')
        .replace("addr", `[${valueString}]`)
        .replace("#dis", valueString + 'h');

    return mnemonic;
}


//update the disassembly for a given memory location
function updateDasm(ramOffset) {
    //do nothing if that offset isn't visible
    if (ramOffset < dasmStartLine || 
        ramOffset >= dasmStartLine + HEXEDIT_NUM_LINES) {
        return;
    }

    const memoryVal = ram[ramOffset];
    const opcodeString = toHexString(memoryVal);
    const index = (ramOffset - dasmStartLine) * 2;
    //update the offset
    dasm.childNodes[index]
        .innerText = toHexString(ramOffset);

    //update the disasm string
    dasm.childNodes[index + 1].innerText = 
        `${opcodeString}: ${getDisassembly(memoryVal)}`;
}


//handler for scroll event on disassembly tab
function scrollDasm(e) {
    const up = e.deltaY < 0;
    const startVal = dasmStartLine;

    if (up) {
        --dasmStartLine;

        if (dasmStartLine < 0) {
            dasmStartLine = 0;
        }
    }
    else {
        dasmStartLine = (dasmStartLine + 1) % MEMORY_SIZE;
    }
    
    //if has scrolled, update every line
    if (dasmStartLine !== startVal) {
        for (let i = 0; i < HEXEDIT_NUM_LINES; ++i) {
            updateDasm(i + dasmStartLine);
        }

        updateHighlights();
    }
}


//show the ram tab and hide the registers one
function changeTab(tabID) {
    if (els.activeTab != undefined) {
        els.activeTab.classList.remove("active");
        els.activeButton.classList.remove("active");
    }
    else {
        hexEditor.classList.remove("active");
        hexEditorButton.classList.remove("active");
    }

    els.activeTab = window[tabID];
    els.activeButton = window[tabID + "Button"];

    els.activeTab.classList.add("active");
    els.activeButton.classList.add("active");
}


function setStateText(text)
{
    state.innerText = text;
}


//create a hex element in the hex editor
function createHexeditHex(x, y) {
    const input = document.createElement("input");
    const memoryOffset = y * HEXEDIT_WPL + x;

    input.onmouseenter = () => {
        input.classList.add("ramHover");
        els.text[memoryOffset].classList.add("ramHover");
    };
    input.onmouseleave = () => {
        input.classList.remove("ramHover");
        els.text[memoryOffset].classList.remove("ramHover");
    };

    input.maxLength = 4;

    input.onchange = () => {
        const offset = hexEditStartLine * HEXEDIT_WPL + memoryOffset;
        ram[offset] = parseInt(input.value, 16);
    };

    input.classList.add("hex");
    input.value = "0000";
    hexEditor.appendChild(input);
}


//create a text element in the hex editor
function createHexeditText(x, y) {
    const span = document.createElement("span");
    const memoryOffset = y * HEXEDIT_WPL + x;
    const mouseEnter = () => {
        span.classList.add("ramHover");
        els.hex[memoryOffset].classList.add("ramHover");
    };
    const mouseLeave = () => {
        span.classList.remove("ramHover");
        els.hex[memoryOffset].classList.remove("ramHover");
    };

    span.onmouseenter = mouseEnter;
    span.onmouseleave = mouseLeave;

    span.classList.add("text");
    span.innerHTML = ".";
    
    hexEditor.appendChild(span);
}


function createRegView(regID) {
    const view = document.createElement("div");
    const input = document.createElement("input");
    const header = document.createElement("header");

    view.classList.add("regView");

    //add class to match highlighting
    if (Object.keys(ramHighlightLocs).includes(regID)) {
        view.classList.add(regID + "Loc");
    }

    header.innerText = regID.toUpperCase();
    
    input.value = "0".repeat(WORD_SIZE);
    input.autocomplete = "off";
    input.maxLength = 4;
    input.id = regID;

    input.onchange = () => {
        regs[regID] = parseInt(input.value, 16);
    };

    //save reference to the input
    els[regID] = input;

    //create proxy entry
    regs[regID] = 0;

    view.appendChild(header);
    view.appendChild(input);

    return view;
}


function createOpcodeList() {
    for (const code in opcodes) {
        const {m, d} = opcodes[code];

        if (m != undefined && d != undefined) {
            const codeText = document.createElement("p");
            codeText.innerText = parseInt(code).toString(16).toUpperCase();
            const mText = document.createElement("p");
            mText.innerText = m;
            const dText = document.createElement("p");
            dText.innerText = d;
    
            opcodeList.appendChild(codeText);
            opcodeList.appendChild(mText);
            opcodeList.appendChild(dText);
        }
    }
}


//creates all the dynamic elements
//such as the RAM view, disassembler
function memInit() {
    zeroRam();

    //create the text elements for the hex editor
    //and bind them to the correct data
    for (let y = 0; y < HEXEDIT_NUM_LINES; ++y) {
        const span = document.createElement("span");

        //add the offset element
        span.classList.add("offset");
        span.innerHTML = toHexString(y * HEXEDIT_WPL);
        hexEditor.appendChild(span);

        for (let x = 0; x < HEXEDIT_WPL; ++x) {
            createHexeditHex(x, y);
        }

        for (let x = 0; x < HEXEDIT_WPL; ++x) {
            createHexeditText(x, y);
        }
    }

    //create the disassembly elements
    for (let y = 0; y < HEXEDIT_NUM_LINES; ++y) {
        const offsetSpan = document.createElement("span");
        const valueSpan = document.createElement("span");
        const index = 1 + y * 2;

        valueSpan.onmouseenter = () => {
            dasm.childNodes[index].classList.add("ramHover");
        }
        valueSpan.onmouseleave = () => {
            dasm.childNodes[index].classList.remove("ramHover");
        }
        valueSpan.onclick = () => {
            regs.pc = dasmStartLine + y;
        }

        //add the offset
        offsetSpan.classList.add("offset");
        offsetSpan.innerHTML = toHexString(y);
        dasm.appendChild(offsetSpan);

        //add the ram value
        const ramVal = toHexString(ram[y]);
        const description = "OPCODES LOADING";
        valueSpan.innerHTML = `${ramVal}: ${description}`;
        dasm.appendChild(valueSpan);
    }
}


function zeroRam() {
    for (let i = 0; i < MEMORY_SIZE; ++i) {
        ram[i] = 0;
    }    
}


function resetRegisters() {
    for (const id of REG_IDS) {
        regs[id] = 0;
    }
}


//reset everything as if the page was just loaded
function fullReset() {
    stopVisualisation();
    zeroRam();
    resetRegisters();

    if (opcodes != undefined) {
        currInst = opcodes.fetch;
        setStateText("Fetch");
    }

    microIndex = 0;
    stdio.innerHTML = "";
    romChooser.value = null;
}


function toHexString(i, length = 4) {
    return i.toString(16).toUpperCase().padStart(length, '0');
}


function stdout(s) {
    stdio.innerHTML += s;
    stdio.scrollTop = stdio.scrollHeight;
}


function stdoutln(s) {
    stdout(s + '\n');
}


//change the highlighted section of ram to use the new
//value of the specified register
function updateHighlights() {
    for (const id in ramHighlightLocs) {
        const className = id + 'Loc';
        const oldLoc = ramHighlightLocs[id];
        const value = regs[id];

        //if there is an entry in highlighted loc for that register
        if (oldLoc != undefined && els.hex != undefined) {
            const newLoc = getPositionInEditor(value);

            if (els.hex[oldLoc] != undefined) {
                els.hex[oldLoc].classList.remove(className);
            }

            if (newLoc != null) {
                if (els.hex[newLoc] != undefined) {
                    els.hex[newLoc].classList.add(className);
                }
            
                ramHighlightLocs[id] = newLoc;
            }            
        }
    }

    //if the dasm tab has been filled yet
    if (dasm.childNodes.length > 0) {
        for (const id in dasmHighlightLocs) {
            const className = id + 'Loc';
            const oldLoc = dasmHighlightLocs[id];
            const value = regs[id];

            dasm.childNodes[oldLoc].classList.remove(className);
            
            if (value >= dasmStartLine && 
                value < dasmStartLine + HEXEDIT_NUM_LINES) {
                const newLoc = 1 + (value - dasmStartLine) * 2;
                dasm.childNodes[newLoc].classList.add(className);
                dasmHighlightLocs[id] = newLoc;
            }
        }
    }
}


function parseROM(fileText) {
    const lines = fileText.toLowerCase().split("\n");
    
    fullReset();

    //counter for the ORG instruction
    let programCounter = 0;
    
    for (const line of lines) {
        if (line.trim().length != 0) {
            if (line.startsWith("org")) {
                const ans = /org \$?(.+)/.exec(line);
                
                programCounter = parseInt(ans[1], 16);
            }
            else {
                const string = line.slice(0, 4);
                const word = parseInt(string.slice(0, 4), 16);

                if (!isNaN(word)) {
                    ram[programCounter] = word;
                    ++programCounter;
                }
            }
        }
    }
}


function fileChooserHandler(e) {
    const reader = new FileReader();

    reader.addEventListener("loadend", () => {
        parseROM(reader.result);
    });

    zeroRam();

    const file = e.target.files[0];
    reader.readAsText(file);
}

window.onload = () => {
    for (const regID of REG_IDS)
    {
        regViews.appendChild(createRegView(regID));
    }
    
    els.offset = hexEditor.getElementsByClassName("offset");
    els.hex = hexEditor.getElementsByClassName("hex");
    els.text = hexEditor.getElementsByClassName("text");
    
    romChooser.onchange = fileChooserHandler;
    hexEditor.onwheel = scrollHexEditor;
    dasm.onwheel = scrollDasm;

    //add the input listener on the stdio box
    stdio.addEventListener("keydown",e => {
        lastKeyPressed = e.keyCode;
    });

    stdio.addEventListener("keyup", e => {
        lastKeyPressed = null;
    });

    memInit();
    updateHighlights();

    //parse all the opcodes
    fetch("src/opcodes.json").then(res => {
        return res.json();
    }).then(object => {
        //convert the file to a version that's indexable by opcode
        opcodes = [];
        for (const opcode of object) {
            const {o, m, d, c} = opcode;
            const opVal = parseInt(o, 16);
            const obj = {m,d,c};

            //if the opcode was not parsed successdully
            if (opVal.toString(16).padStart(2, "0") !== o) {
                opcodes[o] = obj;
            }
            else {
                opcodes[opVal] = obj;
            }
        }
        currInst = opcodes.fetch;
        setStateText("Fetch");
        createOpcodeList();
    });

    //load the included hello.jas file
    fetch("jas/hello.jas").then(res => {
        return res.text();
    }).then(res => {
        parseROM(res);
    });
};