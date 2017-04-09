/**
 * Created by susu on 17-4-7.
 */
var socketio = require('socket.io');
var io;
var guestNumber = 1;
var nickNames = {};
var namesUsed = [];
var currentRoom = {};

exports.listen = function (server) {
    io = socketio.listen(server);
    io.set('log level', 1);
    io.sockets.on('connection', function (socket) {//定义每个用户链接的处理逻辑
        guestNumber = assignGuestName(socket, guestNumber,
        nickNames, namesUsed);//赋予用户访客名
        joinRoom(socket, 'Lobby');//用户链接上来时放入lobby聊天室
        handleMessageBroadcasting(socket, nickNames);//处理用户的消息
        handleNameChangeAttempts(socket, nickNames, namesUsed);//用户更名
        handleRoomJoining(socket);//聊天室的创建
        socket.on('rooms', function () {//聊天室的变更
            socket.emit('rooms', io.sockets.manager.rooms);
        });
        handleClientDisconnection(socket,nickNames, namesUsed);
    });
};

function assignGuestName(socket, guestNumber, nickNames, namesUsed) {//分配用户昵称
    var name = 'Guest' + guestNumber;//生成新昵称
    nickNames[socket.id] = name;//把用户昵称跟客户端链接ID关联上
    socket.emit('nameResult', {//让用户知道他们的昵称
        success: true,
        name: name
    });
    namesUsed.push(name);//存放已经被占用的昵称
    return guestNumber + 1;//增加用来生成昵称的计数器
}

function joinRoom(socket, room) {//进入聊天室相关的逻辑
    socket.join(room);//让用户进入房间
    currentRoom[socket.id] = room;//记录用户的当前房间
    socket.emit('joinResult', {room: room});//让用户知道他们进入了新房间
    socket.broadcast.to(room).emit('message', {//让用户知道他们进入了新房间
        text: nickNames[socket.id] + ' has joined ' + room + '.'
    });

    var usersInRoom = io.sockets.clients(room);//确定房间有哪些用户
    if(usersInRoom.length > 1) {
        var usersInRoomSummary = 'Users currently in ' + room + ': ';
        for (var index in usersInRoom) {
            var userSocketId = usersInRoom[index].id;
            if (userSocketId != socket.id) {
                if (index > 0) {
                    usersInRoomSummary += ', ';
                }
                usersInRoomSummary += nickNames[userSocketId];
            }
        }
        usersInRoomSummary += '.';
        socket.emit('message', {text: usersInRoomSummary});//将房间里其他用户的汇总发送给这个用户
    }
}

function handleNameChangeAttempts(socket, nickNames, nameUsed) {//更名请求的处理逻辑
    socket.on('nameAttempt', function (name) {//添加nameAttempt的监听时间
        if (name.indexOf('Guest') == 0) {//昵称不能以Guest开头
            socket.emit('nameResult', {
                success: false,
                message: 'Names cannot begin with "Guest".'
            });
        } else {
            if (namesUsed.indexOf(name) == -1) {//如果昵称还没注册就注册上
                var previousName = nickNames[socket.id];
                var previousNameIndex = namesUsed.indexOf(previousName);
                namesUsed.push(name);
                nickNames[socket.id] = name;
                delete namesUsed[previousNameIndex];//删掉之前用户的昵称,让其他用户可以使用
                socket.emit('nameResult', {
                    success: true,
                    name: name
                });
                socket.broadcast.to(currentRoom[socket.id]).emit('mesage', {
                    text: previousName + ' is now known as ' + name + '.'
                });
            } else {//如果昵称已经被占用,给客户端发送错误消息
                socket.emit('nameResult', {
                    success: false,
                    message: 'That name is already in use.'
                });
            }
        }
    });
}

function handleMessageBroadcasting(socket) {//发送聊天消息
    socket.on('message', function (message) {
        socket.broadcast.to(message.room).emit('message', {
            text: nickNames[socket.id] + ': ' + message.text
        });
    });
}

function handleRoomJoining(socket) {//创建房间
    socket.on('join', function (room) {
        socket.leave(currentRoom[socket.id]);
        joinRoom(socket, room.newRoom);
    })
}

function handleClientDisconnection(socket) {
    socket.on('disconnect', function () {
        var nameIndex = namesUsed.indexOf(nickNames[socket.id]);
        delete namesUsed[nameIndex];
        delete nickNames[socket.id];
    })
}