'use strict';

/** Counts empty tiles around a certain positions
 *
 * For now, everything that isn't counted as a wall
 * as in terrain object is counted as free space.
 *
 * @param Number|Object x An object containing x, y and roomName or x position
 * @param Number|undefined y Y position if x is not an object
 * @param String|undefined room Room name if x is not an object
 *
 * @return Number The number of empty tiles
 */
function countEmptyTilesAround(x, y, room) {
    var hasWall = function(list) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].type === "terrain" && list[i].terrain === "wall") {
                return true;
            }
        }

        return false;
    };

    if (typeof x === "object" &&
        typeof x.x === "number" &&
        typeof x.y === "number" &&
        typeof x.roomName === "string"
    ) {
        room = x.roomName;
        y = x.y;
        x = x.x;
    }

    if (x < 1 || x > 48 || y < 1 || y > 49)
        return;

    var tiles = Game.rooms[room].lookAtArea(y - 1, x - 1, y + 1, x + 1);
    var spaces = 0;

    if (!hasWall(tiles[y - 1][x - 1])) spaces++;
    if (!hasWall(tiles[y - 1][x]))     spaces++;
    if (!hasWall(tiles[y - 1][x + 1])) spaces++;
    if (!hasWall(tiles[y][x - 1]))     spaces++;
    if (!hasWall(tiles[y][x + 1]))     spaces++;
    if (!hasWall(tiles[y + 1][x - 1])) spaces++;
    if (!hasWall(tiles[y + 1][x]))     spaces++;
    if (!hasWall(tiles[y + 1][x + 1])) spaces++;

    return spaces;
}

/**
 * Counts the number of roads, swamps and normal tiles on a given path
 *
 * @param path Array
 * @param room String Name of the room
 *
 * @return Object Formatted {normal: x, road: y, swamp: z}
 */
function examinePath(path, room) {
    var conclusion = {
        normal: 0,
        road: 0,
        swamp: 0
    };

    var tileData;
    var isSwamp;
    var isRoad;

    for (var i = 0; i < path.length; i++) {
        tileData = room.lookAt(path[i]);
        isSwamp = false;
        isRoad = false;

        for (var j = 0; j < tileData.length; j++) {
            if (tileData[j].type === "construction" && tileData[j].structure.type === "road") {
                isRoad = true; break;
            } else if (tileData[j].type === "terrain" && tileData[j].terrain === "swamp") {
                isSwamp = true;
            }
        }

        if (isSwamp) {
            conclusion.swamp++;
        } else if (isRoad) {
            conclusion.road++;
        } else {
            conclusion.normal++;
        }
    }

    return conclusion;
}

/**
 * Usage Calls command command_<parameter1> to execute its native property if available
 */
var exec = function() {
    if (arguments.length === 0) {
        throw new Error('Expected at least 1 parameter to execute a function');
    }

    var commands = AI.extensions.commands;

    var cmd = arguments[0];

    if (commands[cmd] === undefined) {
        throw new Error("Command " + cmd + " doesn't exist");
    }

    if (commands[cmd].native !== undefined && typeof commands[cmd].native === "function") {
        return commands[cmd].native.apply(null, arguments);
    } else {
        throw new Error("Can't execute command " + cmd + " natively");
    }
};

/**
 * Get the cost for building a creep
 */
var getCreepCost = function(parts) {
    var cost = 0;

    for (var i = 0; i < parts.length; i++) {
        if (parts[i] in BODYPART_COST) {
            cost += BODYPART_COST[parts[i]];
        }
        else {
            return -1;
        }
    }

    return cost;
};

/**
 * Get some temporal storage
 */
var getTmp = function() {
    if (!AI.tmp) {
        AI.tmp = {};
    }

    return AI.tmp;
};

/**
 * Checks if a certain content has been found repeating itself
 *
 * A message is found not repeating if the message wasn't used in the current
 * or previous round.
 *
 * @param string msg Message to check
 * @param string namespace Namespace for categorization
 *
 * @return true if send, false if repeating, undefined if repeating in same round
 */
var dontRepeat = function(msg, namespace) {

    // Tracker management
    if (!(Memory.dontRepeat)) {
        Memory.dontRepeat = {
            time: Game.time,
            logCurrent: {},
            logPrevious: {},
        };
    } else if (Memory.dontRepeat.time !== Game.time) {
        Memory.dontRepeat.logPrevious =
            Memory.dontRepeat.time + 1 === Game.time ?
                Memory.dontRepeat.logCurrent : {};
        Memory.dontRepeat.logCurrent = {};
        Memory.dontRepeat.time = Game.time;
    }

    // Get key
    var key = namespace.replace('_', '') + '_' + msg;

    // Run cache checks
    if (key in Memory.dontRepeat.logCurrent) return;

    Memory.dontRepeat.logCurrent[key] = true;
    return !(key in Memory.dontRepeat.logPrevious);
};

/**
 * Spamcontrolled console logging
 *
 * @param string msg
 * @param bool warn Set to false to disable
 *
 * @return true if send, false if repeating, undefined if repeating in same round
 */
var logOnce = function(msg, warn) {
    var result = dontRepeat(msg, 'log');

    if (undefined === result && true === warn)
        console.log('Warning: reusing message "' + msg + '" in same round');
    else if (result)
        console.log(msg);

    return result;
};

var firstTurnCache;
var isFirstTurn = function() {
    // Check for cache hits
    if (firstTurnCache !== undefined)
        return firstTurnCache;

    // Make sure memory is set
    if (Memory.permanent === undefined)
        Memory.permanent = { restarts : [] }; // Log restarts for debugging

    // Get spawns to compare later
    var oldSpawnIds = Memory.permanent.spawnIds;
    Memory.permanent.spawnIds = Object.keys(Game.spawns).map(
        function(s) {
            return Game.spawns[s].id;
        }
    ).sort();

    // In case the old value isn't an array
    if (!Array.isArray(oldSpawnIds)) {
        Memory.permanent.firstTurn = Game.time;
        Memory.permanent.restarts.push({start: Game.time, spawns: Memory.permanent.spawnIds});
        return (firstTurnCache = true);
    }

    // Check for spawn matches
    var hasSpawnId = false;
    for (var i = oldSpawnIds.length; i >= 0; i--) {
        if (Memory.permanent.spawnIds.indexOf(oldSpawnIds[i]) > -1) {
            hasSpawnId = true;
        }
    }

    // Not the first turn if at least one spawn matches
    if (hasSpawnId) {
        return (firstTurnCache = false);
    }

    // We seem to be reset, we have to start from scratch!

    // False positive check to avoid memory being filled with restarts
    if ((Game.time - Memory.permanent.firstTurn) < 10) {
        if (Memory.permanent.multipleRestartsSince === undefined) {
            Memory.permanent.multipleRestartsSince = Game.time;
        }

        Memory.permanent.firstTurn = Game.time;
        return (firstTurnCache = true);
    }

    var data = {start: Game.time, spawns: Memory.permanent.spawnIds};
    if (Memory.permanent.multipleRestartsSince !== undefined) {
        data.multipleRestartsSince = Memory.permanent.multipleRestartsSince;
    }

    Memory.permanent.firstTurn = Game.time;
    Memory.permanent.restarts.push(data);
    Memory.permanent.multipleRestartsSince = undefined;
    return (firstTurnCache = true);
};

// Distance

var distance = function(x1, y1, x2, y2) {
    if (x1 instanceof Object && x1.pos instanceof RoomPosition) {
        x1 = x1.pos;
    }

    if (y1 instanceof Object && y1.pos instanceof RoomPosition) {
        y1 = y1.pos;
    }

    if (x1 instanceof RoomPosition && y1 instanceof RoomPosition &&
        x1.roomName !== y1.roomName
    ) {
        return ERR_NOT_IN_RANGE;
    }

    if (x1 instanceof Object && y1 instanceof Object) {
        y2 = y1.y;
        x2 = y1.x;
        y1 = x1.y;
        x1 = x1.x;
    }

    return Math.sqrt(
        Math.abs(Math.pow(x2 - x1, 2)) +
        Math.abs(Math.pow(y2 - y1, 2))
    );
};

var manhattenDistance = function(x1, y1, x2, y2) {
    if (x1 instanceof Object && x1.pos instanceof RoomPosition) {
        x1 = x1.pos;
    }

    if (y1 instanceof Object && y1.pos instanceof RoomPosition) {
        y1 = y1.pos;
    }

    if (x1 instanceof RoomPosition && y1 instanceof RoomPosition &&
        x1.roomName !== y1.roomName
    ) {
        return ERR_NOT_IN_RANGE;
    }

    if (x1 instanceof Object && y1 instanceof Object) {
        y2 = y1.y;
        x2 = y1.x;
        y1 = x1.y;
        x1 = x1.x;
    }

    return Math.abs(x2 - x1) + Math.abs(y2 - y1);
};

module.exports = {
    countEmptyTilesAround: countEmptyTilesAround,
    distance: distance,
    dontRepeat: dontRepeat,
    examinePath: examinePath,
    exec: exec,
    getTmp: getTmp,
    getCreepCost: getCreepCost,
    isFirstTurn: isFirstTurn,
    logOnce: logOnce,
    manhattenDistance: manhattenDistance,

    test: {
        set firstTurnCache (value) { firstTurnCache = value; },
        get firstTurnCache () { return firstTurnCache; }
    }
};
