/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, node: true */
/*global */

(function () {
    "use strict";
    
    var spawn = require('child_process').spawn;
    
    var _sessions = {},
        domainManager;
        
    /**
     * Creates a bash or windows command-line process
     * @param {string} initialDirectory Absolute path
     * @return {number} PID of the bash process
     */
    function createSession(initialDirectory) {
        var session = spawn("bash", ["--login"]);
        
        session.stdin.write("cd " + initialDirectory + "\n");
        
        session.stdout.setEncoding();
        session.stdout.on("data", function (data) {
            domainManager.emitEvent("terminal", "stdout", [session.pid, data]);
        });
        
        session.stderr.setEncoding();
        session.stderr.on("data", function (data) {
            domainManager.emitEvent("terminal", "stderr", [session.pid, data]);
        });
        
        session.on("exit", function (code) {
            domainManager.emitEvent("terminal", "exit", [session.pid, code]);
        });
        
        _sessions[session.pid] = session;
        
        return session.pid;
    }
    
    function write(pid, message) {
        var session = _sessions[pid];
        
        if (!session) {
            return;
        }
        
        session.stdin.write(message + "\n");
    }
    
    /**
     * Initializes the test domain with several test commands.
     * @param {DomainManager} DomainManager The DomainManager for the server
     */
    function init(DomainManager) {
        domainManager = DomainManager;
        
        if (!DomainManager.hasDomain("terminal")) {
            DomainManager.registerDomain("terminal", {major: 0, minor: 1});
        }
        
        // terminal.createSession()
        DomainManager.registerCommand(
            "terminal",         // domain name
            "createSession",    // command name
            createSession,      // command handler function
            false,              // this command is synchronous
            "Opens a new terminal session",
            [
                {
                    name: "initialDirectory",
                    type: "string",
                    description: "Initial directory path"
                }
            ],
            [
                {
                    name: "session",
                    type: "number",
                    description: "session data"
                }
            ]
        );
        
        // terminal.write(session, message)
        DomainManager.registerCommand(
            "terminal",         // domain name
            "write",            // command name
            write,              // command handler function
            false,              // this command is synchronous
            "Opens a new terminal session",
            [
                {
                    name: "session",
                    type: "number",
                    description: "session data"
                },
                {
                    name: "session",
                    type: "number",
                    description: "session data"
                }
            ],
            []             // no return value
        );
        
        // event: terminal.stdout
        DomainManager.registerEvent(
            "terminal",
            "stdout",
            [
                {
                    name: "pid",
                    type: "number",
                    description: "Shell PID"
                },
                {
                    name: "message",
                    type: "string",
                    description: "stdout message"
                }
            ]
        );
        
        // event: terminal.stderr
        DomainManager.registerEvent(
            "terminal",
            "stderr",
            [
                {
                    name: "pid",
                    type: "number",
                    description: "Shell PID"
                },
                {
                    name: "message",
                    type: "string",
                    description: "stderr message"
                }
            ]
        );
        
        // event: terminal.exit
        DomainManager.registerEvent(
            "terminal",
            "exit",
            [
                {
                    name: "pid",
                    type: "number",
                    description: "Shell PID"
                },
                {
                    name: "code",
                    type: "number",
                    description: "Exit code when shell exists"
                }
            ]
        );
    }
    
    exports.init = init;
    
}());