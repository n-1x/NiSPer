//Auther: Nicholas J D Dean
//This program converts a .mco instruction
//set file designed for JASPer and creates two
//files. Both are readable by NiSPer, but one
//is designed to be human readable, while the
//other aims for a smaller file size for lower
//download times
const fs = require("fs");

function includesAnyOf(string, includes) {
    let ans = false;

    for (const s of includes) {
        ans |= string.includes(s);
    }

    return ans;
}


//if there is a specifier on the value
//return it separately from the value's id
//eg. readSpecifier("ir(operand)") == ["ir", "operand"]
function readSpecifier(string) {
    const specRegex = (/(.*)\((.*)\)/g);
    const result = specRegex.exec(string);
    let src = string, spec = '';

    if (result != null) {
        src = result[1];
        spec = result[2];

        if (spec === "opcode" || spec === "15:8") {
            spec = "1";
        }
        else if (spec === "operand" || spec === "7:0") {
            spec = "2";
        }
        else if (spec === "intvec") {
            spec = "int";
        }
    }

    return [src, spec];
}


function convertMicro(code) {
    //remove square brackets and switch <- to =
    code = code.replace(/\[|\]/g, "")
               .replace(/<-/g, '=');

    let [lhs, rhs] = code.split("=");
    const psrTest = (/psr\((.)\)==(.)/g).exec(code);
    const REG_IDS = [
        "pc", "inc", "ir", "sp", "mar", "mdr", "a", 
        "b", "alux", "aluy", "alur", "psr"
    ];

    let [dst, dstSpec] = readSpecifier(lhs);
    let [src, srcSpec] = readSpecifier(rhs);

    if (psrTest != null) { //micro for testing the psr
        src = "?psr"
        srcSpec = psrTest[1];
        dst = psrTest[2];
    }
    else if (rhs === "jumpers(intbase)") {
        src = "IB",
        srcSpec = "#"
    }
    else if (rhs === "mmar") { //m[mar] with brackets removed
        src = "ram";
    }
    else if (lhs === "mmar") {
        dst = "ram";
    }
    else if (rhs === "alux>>1") {
        src = "alu";
        dst = "alur";
        srcSpec = ">";
    }
    else if (rhs === "alux<<1") {
        src = "alu";
        dst = "alur";
        srcSpec = "<";
    }
    else if (rhs === "alux+1") {
        src = "alu";
        dst = "alur";
        srcSpec = "i";
    }
    else if (rhs === "alux-1") {
        src = "alu";
        dst = "alur";
        srcSpec = "d";
    }
    else if (rhs === "~alux") {
        src = "alu";
        dst = "alur";
        srcSpec = "~";
    }
    else if (rhs === "~alux+1") {
        src = "alu";
        dst = "alur";
        srcSpec = "!";
    }
    else if (rhs === "alux+aluy+psr(c)") {
        //carry add
        src = "alu";
        dst = "alur";
        srcSpec = "c+";
    }
    else if (lhs === "alur(7:0)") {
        //swap
        src = "alu";
        dst = "alur";
        srcSpec = "^";
    }
    else if (dst === "alur") { //only alu operations can write to alur
        //extract the operation character
        const char = src.replace(/[a-z]/g, '');
        src = "alu";
        srcSpec = char;
        dst = "alur";
    }
    else if (includesAnyOf(code, ["halt", "nop"])) {
      return [];
    }
    else if (!REG_IDS.includes(src)) {
        //if it matched none of the above rules
        //and it's not a register name, it must
        //be a fixed value, so prepend the fixed
        //value indicator
        srcSpec = "#";
    }

    return [src, srcSpec, dst, dstSpec];
}


//parses an MCO file at the given path
function parseMCO(path) {
    data = fs.readFileSync(path).toString();

    const opcodes = [];
    const stringRegex = /"(.*)"/;
    let currentOpcode = {};

    //lambda for adding currentOpcode to opcodes if 
    //parsing was successfull
    const pushOp = () => {
        if (currentOpcode.failed) {
            console.log("Failed to read opcode " + currentOpcode.o + "\n");
        }
        else if (currentOpcode.c !== undefined) {
            //copy the code then remove it from the object
            opcodes.push(currentOpcode);
        }
    };

    //read file line by line
    for (const line of data.split('\r\n')) {
        //ignore comments
        if (line.startsWith("*") || line === '\r' || line.length === 0) {
            continue;
        }
        else if (line.startsWith("Fetch")) {
            pushOp();
            currentOpcode = {o: "fetch"}
        }
        else if (line.startsWith("Interrupt")) {
            pushOp();
            currentOpcode = {o: "interrupt"};
        }
        else if (line.startsWith("Opcode")) {
            const split = line.split(' ');
            const opcode = split[1];

            pushOp();
            currentOpcode = {o: opcode};
        }
        else if (line.startsWith("Mnemonic")) {
            const mnem = stringRegex.exec(line)[1];
            currentOpcode.m = mnem;
        }
        else if (line.startsWith("Description")) {
            const desc = stringRegex.exec(line)[1];
            currentOpcode.d = desc;
        }
        else {
            if (currentOpcode.c === undefined) {
                currentOpcode.c = [];
            }

            const micro = line.split(' ')[0].toLowerCase();

            //skip all cu instructions
            if (!micro.includes("cu")) {
                const convertedMicro = convertMicro(micro);
    
                if (convertedMicro !== null) {
                    currentOpcode.c.push(convertedMicro);
                }
                else {
                    //mark opcode as null
                    console.log("Problem micro: " + micro);
                    currentOpcode.failed = true;
                }
            }
        }
    }

    pushOp();
    return opcodes;
}

const codes = parseMCO("./instruct.mco");
console.log(`Parsed ${codes.length} opcodes`);

const path = "./opcodes";

//write minified version
let json = JSON.stringify(codes, null, 0);
fs.writeFileSync(`${path}.json`, json);

//write pretty version
json = JSON.stringify(codes, null, 2);
fs.writeFileSync(`${path}.pretty.json`, json);
console.log("Finished");