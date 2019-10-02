//Author: Nicholas J D Dean
//Reminder to remove testing file
console.log("********TESTING FILE INCLUDED********");

const tests = [
    {
        desc: "ALU PSR zero bit",
        init: {
            alux: 0x1010,
            aluy: 0x1010
        },
        micro: makeALUMicro(ALU_OPS.SUB),
        result: {
            alur: 0,
            psr: PSR_Z
        },
    },
    {
        desc: "PSR negative bit",
        init: {
            alux: 0xab,
            aluy: 0xba
        },
        micro: makeALUMicro(ALU_OPS.SUB),
        result: {
            alur: 0xfff1,
            psr: PSR_C | PSR_N | PSR_V
        }
    },
    {
        desc: "Overflow on add",
        init: {
            alux: 0x7fff,
            aluy: 0xf
        },
        micro: makeALUMicro(ALU_OPS.ADD),
        result: {
            alur: 0x800e,
            psr: PSR_N | PSR_V
        }
    },
    {
        desc: "Carry on add",
        init: {
            alux: 0xfff0,
            aluy: 0xfafa
        },
        micro: makeALUMicro(ALU_OPS.ADD),
        result: {
            alur: 0xfaea,
            psr: PSR_C | PSR_N
        }
    },
    {
        desc: "Shift left",
        init: {
            alux: 0xf,
        },
        micro: makeALUMicro(ALU_OPS.SHL),
        result: {
            alur: 0x1e
        }
    },
    {
        desc: "Carry on shift left",
        init: {
            alux: 0xfff0
        },
        micro: makeALUMicro(ALU_OPS.SHL),
        result: {
            alur: 0xffe0,
            psr: PSR_N | PSR_C
        }
    },
    {
        desc: "Carry on shift right",
        init: {
            alux: 0b11
        },
        micro: makeALUMicro(ALU_OPS.SHR),
        result: {
            alur: 0b1,
            psr: PSR_C
        }
    },
    {
        desc: "NOT",
        init: {
            alux: 0b0100011000101010
        },
        micro: makeALUMicro(ALU_OPS.NOT),
        result: {
            alur: 0b1011100111010101,
            psr: PSR_N
        }
    },
    {
        desc: "AND",
        init: {
            alux: 0b1111000011110001,
            aluy: 0b1100110011001101
        },
        micro: makeALUMicro(ALU_OPS.AND),
        result: {
            alur: 0b1100000011000001,
            psr: PSR_N
        }
    },
    {
        desc: "Overflow on inc",
        init: {
            alux: 0x7fff,
        },
        micro: makeALUMicro(ALU_OPS.INC),
        result: {
            alur: 0x8000,
            psr: PSR_V | PSR_N
        }
    },
    {
        desc: "Carry on inc",
        init: {
            alux: 0xffff
        },
        micro: makeALUMicro(ALU_OPS.INC),
        result: {
            alur: 0,
            psr: PSR_C | PSR_Z
        }
    },
    {
        desc: "Underflow on dec",
        init: {
            alux: 0x8000
        },
        micro: makeALUMicro(ALU_OPS.DEC),
        result: {
            alur: 0x7fff,
            psr: PSR_V
        }
    },
    {
        desc: "Carry on dec",
        init: {
            alux: 0
        },
        micro: makeALUMicro(ALU_OPS.DEC),
        result: {
            alur: 0xffff,
            psr: PSR_C | PSR_N
        }
    },
    {
        desc: "Swap",
        init: {
            alux: 0xda4a
        },
        micro: makeALUMicro(ALU_OPS.SWAP),
        result: {
            alur: 0x4ada
        }
    },
    {
        desc: "REG Simple move",
        init: {
            a: 0xfeed
        },
        micro: [
            "a",
            SPECS.ALL,
            "b",
            SPECS.ALL
        ],
        result: {
            b: 0xfeed
        }
    },
    {
        desc: "REG Move second byte",
        init: {
            a: 0xabcd
        },
        micro: [
            "a",
            SPECS.BYTE2,
            "b",
            SPECS.ALL
        ],
        result: {
            b: 0xcd
        }
    },
    {
        desc: "REG First byte to first byte",
        init: {
            a: 0xface
        },
        micro: [
            "a",
            SPECS.BYTE1,
            "b",
            SPECS.BYTE1
        ],
        result: {
            b: 0xfa00
        }
    },
    {
        desc: "REG First byte to second byte",
        init: {
            a: 0xbabe
        },
        micro: [
            "a",
            SPECS.BYTE1,
            "b",
            SPECS.BYTE2
        ],
        result: {
            b: 0xba
        }
    },
    {
        desc: "REG Second byte to first byte",
        init: {
            a: 0xf00d
        },
        micro: [
            "a",
            SPECS.BYTE2,
            "b",
            SPECS.BYTE1,
        ],
        result: {
            b: 0x0d00
        }
    },
    {
        desc: "Second byte to second byte",
        init: {
            a: 0xbeee
        },
        micro: [
            "a",
            SPECS.BYTE2,
            "b",
            SPECS.BYTE2
        ],
        result: {
            b: 0xee
        }
    },
    {
        desc: "Write value to ram",
        init: {
            mdr: 0x1234,
            mar: 0x4b
        },
        micro: [
            "mdr",
            SPECS.ALL,
            "ram",
            SPECS.ALL
        ],
        result: {
            ram: {
                0x4b: 0x1234
            }
        }
    },
    {
        desc: "Read value from ram",
        init: {
            mar: 0xab,
            ram: {
                0xab: 0xdead
            }
        },
        micro: [
            "ram",
            SPECS.ALL,
            "mdr",
            SPECS.ALL
        ],
        result: {
            mdr: 0xdead
        }
    },
    {
        desc: "Write direct value",
        init: {},
        micro: [
            "dade",
            SPECS.VALUE,
            "a",
            SPECS.ALL
        ],
        result: {
            a: 0xdade
        }
    },
    {
        desc: "Write to psr i",
        init: {},
        micro: [
            "1",
            SPECS.VALUE,
            "psr",
            SPECS.IBIT
        ],
        result: {
            psr: PSR_I
        }
    },
    {
        desc: "Write to PSR intvec",
        init: {},
        micro: [
            "5",
            "#",
            "psr",
            "int"
        ],
        result: {
            psr: 0b0000010100000000
        }
    },
    {
        desc: "Read from PSR",
        init: {
            psr: 0b0000010100000000
        },
        micro: [
            "psr",
            SPECS.INTVEC,
            "a",
            SPECS.ALL
        ],
        result: {
            a: 0b101
        }
    },
    {
        desc: "Read INT_VEC",
        init: {},
        micro: [
            "IB",
            "#",
            "aluy",
            SPECS.ALL
        ],
        result: {
            aluy: INT_BASE
        }
    }
];


//only thing that changes in an alu micro is the op,
//so this function is a shorthand for making one
function makeALUMicro(op) {
    return ["alu", op, "alur", SPECS.ALL];
}


//sets the value of each register specified
//in the object
function setState(state) {
    fullReset();
    for (const regID in state) {
        if (regID === "ram") {
            //set all listed ram locations
            for (const addr in state.ram) {
                ram[addr] = state.ram[addr];
            }
        }
        else {
            regs[regID] = state[regID];
        }
    }
}


//print the PSR bits of the given word nicely
function printPSRBits(word) {
    const i = word & PSR_I;
    const e = word & PSR_E;
    const int = word & PSR_INT;
    const v = word & PSR_V;
    const n = word & PSR_N;
    const z = word & PSR_Z;
    const c = word & PSR_C;

    let ans = "";

    if (i !== 0) {
        ans += "i";
    }

    if (e !== 0) {
        ans += "e";
    }

    if (int !== 0) {
        ans += "(V" + (int >> 8).toString(2).padStart(3, "0") + ")";
    }

    if (v !== 0) {
        ans += "v";
    }

    if (n !== 0) {
        ans += "n";
    }

    if (z !== 0) {
        ans += "z";
    }

    if (c !== 0) {
        ans += "c";
    }

    return ans;
}



function runTests() {
    let failedCount = 0;

    for (const test of tests) {
        console.log("TEST: " + test.desc);
        fullReset();
        setState(test.init);
        runMicrocode(test.micro);
        //strings explaining each failiure
        const failStrings = [];
        
        //check resulting state
        for (const regID in test.result) {
            //check ram values
            if (regID === "ram") {
                for (const addr in test.result[regID]) {
                    const expectedVal = test.result[regID][addr];
                    const actualVal = ram[addr];

                    if (expectedVal !== actualVal) {
                        const eStr = toHexString(expectedVal);
                        const aStr = toHexString(actualVal);

                        failStrings.push(`RAM[${addr}] E: ${eStr} A: ${aStr}`);
                    }
                }
            }
            else { //chec reg values
                const expectedVal = test.result[regID];
                const actualVal = regs[regID];
    
                if (actualVal !== expectedVal) {
                    let eStr = toHexString(expectedVal);
                    let aStr = toHexString(actualVal);
    
                    //change to pretty strings for PSR
                    if (regID === "psr") {
                        eStr = printPSRBits(expectedVal);
                        aStr = printPSRBits(actualVal);
                    }
    
                    failStrings.push(`${regID} E: ${eStr} A: ${aStr}`);
                }
            }
        }

        if (failStrings.length > 0) {
            ++failedCount;
            console.log("======TEST FAILED======");
            console.log(test.desc);
            
            for (const failString of failStrings) {
                console.log(failString);
            }
            console.log("=======================");
            console.log();
        }
        else {
            console.log("\tPASSED");
        }
    }

    if (failedCount === 0) {
        console.log("ALL TESTS PASSED");
    }
    else {
        console.log(`TESTS FAILED: ${failedCount} / ${tests.length}`);
    }
}