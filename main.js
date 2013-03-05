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
maxerr: 50, browser: true */
/*global $, define, brackets */

define(function (require, exports, module) {
    "use strict";

    var AppInit         = brackets.getModule("utils/AppInit"),
        CommandManager  = brackets.getModule("command/CommandManager"),
        ExtensionUtils  = brackets.getModule("utils/ExtensionUtils"),
        Menus           = brackets.getModule("command/Menus"),
        NodeConnection  = brackets.getModule("utils/NodeConnection"),
        ProjectManager  = brackets.getModule("project/ProjectManager");
    
    var COMMAND_NEW_TERMINAL = "view.terminal.new";
    
    var nodeConnection  = new NodeConnection(),
        pids            = {};
    
    function _console(f, argsArray) {
        var args = ["[brackets-terminal]"];
        
        if (argsArray && argsArray.length > 0) {
            args = args.concat(Array.prototype.slice.call(argsArray));
        }
        
        f.apply(console, args);
    }
    
    function error() {
        _console(console.error, arguments);
    }
    
    function log() {
        _console(console.log, arguments);
    }
        
    /**
     * Createe a new shell session
     */
    function createSession(initialDirectory) {
        var sessionPromise = nodeConnection.domains.terminal.createSession(initialDirectory);
        sessionPromise.fail(function (err) {
            error("failed to run terminal.createSession", err);
        });
        sessionPromise.done(function (pid) {
            log("Created a session, PID " + pid);
        });
        return sessionPromise;
    }
    
    /**
     * Opens a shell for the current project
     */
    function _handleNewTerminal() {
        var root = ProjectManager.getProjectRoot().fullPath;
        
        createSession(root).done(function (pid) {
            pids[pid] = pid;
            
            // test
            nodeConnection.domains.terminal.write(pid, "grunt");
        });
    }
    
    AppInit.appReady(function () {
        // connect to node server
        nodeConnection.connect(true).done(function () {
            // load terminal domain
            var path = ExtensionUtils.getModulePath(module, "node/TerminalDomain");
            nodeConnection.loadDomains([path], true).done(function () {
                // register event handlers
                var $nodeConnection = $(nodeConnection);
                
                $nodeConnection.on("terminal.stdout", function (event, pid, data) {
                    log(pid, data);
                });
                
                $nodeConnection.on("terminal.stderr", function (event, pid, data) {
                    error(pid, data);
                });
                
                $nodeConnection.on("terminal.exit", function (event, pid, data) {
                    log("exit", pid, data);
                });
                
                // register commands
                CommandManager.register("New Terminal", COMMAND_NEW_TERMINAL, _handleNewTerminal);
                
                var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
                menu.addMenuItem(COMMAND_NEW_TERMINAL);
            });
        });
    });

});