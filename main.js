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
/*global $, define, brackets, Backbone, CodeMirror */

define(function (require, exports, module) {
    "use strict";
    
    require("thirdparty/underscore-min");
    require("thirdparty/backbone-min");
    //require("src/thirdparty/CodeMirror2/mode/shell/shell");

    var AppInit         = brackets.getModule("utils/AppInit"),
        CommandManager  = brackets.getModule("command/CommandManager"),
        EditorManager   = brackets.getModule("editor/EditorManager"),
        ExtensionUtils  = brackets.getModule("utils/ExtensionUtils"),
        Menus           = brackets.getModule("command/Menus"),
        NodeConnection  = brackets.getModule("utils/NodeConnection"),
        ProjectManager  = brackets.getModule("project/ProjectManager");
    
    var PANEL_TEMPLATE          = require("text!console-panel-template.html"),
        CONSOLE_TEMPLATE        = require("text!console-template.html"),
        COMMAND_NEW_TERMINAL    = "view.terminal.new";
    
    var nodeConnection  = new NodeConnection(),
        panel,
        terminalCollection;
    
    function _consoleWrite(f, argsArray) {
        var args = ["[brackets-terminal]"];
        
        if (argsArray && argsArray.length > 0) {
            args = args.concat(Array.prototype.slice.call(argsArray));
        }
        
        f.apply(console, args);
    }
    
    function error() {
        _consoleWrite(console.error, arguments);
    }
    
    function log() {
        _consoleWrite(console.log, arguments);
    }
    
    var Terminal = Backbone.Model.extend({
        
        defaults: function () {
            return {
                title           : "Terminal",
                pid             : 0,
                nodeConnection  : nodeConnection,
                status          : Terminal.STATUS_DISCONNECTED
            };
        },
        
        open: function (initialDirectory) {
            var self = this,
                sessionPromise = nodeConnection.domains.terminal.spawnSession(initialDirectory);
            
            this.set({ status: Terminal.STATUS_PENDING });
            
            sessionPromise
                .fail(function (err) {
                    self.set({status: Terminal.STATUS_FAILED});
                })
                .done(function (pid) {
                    log("Spawned a session, PID " + pid);
                    
                    self.set({
                        status  : Terminal.STATUS_CONNECTED,
                        pid     : pid,
                        id      : pid
                    });
                });
        },
        
        close: function () {
            if (!this.get("pid")) {
                return;
            }
            
            this.get("nodeConnection").domains.terminal.killSession(this.get("pid"));
        },
        
        write: function (message) {
            this.get("nodeConnection").domains.terminal.write(this.get("pid"), message);
        },
        
        end: function () {
            this.get("nodeConnection").domains.terminal.end(this.get("pid"));
        }
        
    }, {
        STATUS_DISCONNECTED : 0,
        STATUS_PENDING      : 1,
        STATUS_CONNECTED    : 2,
        STATUS_FAILED       : 3
    });
    
    var TerminalCollection = Backbone.Collection.extend({
        
        model: Terminal
        
    });
    
    var TerminalView = Backbone.View.extend({
        
        initialize: function () {
            this.codeMirror = new CodeMirror(this.el);
            
            // listen for CodeMirror events
            this.codeMirror.setOption("onKeyEvent", this.onKeyEvent.bind(this));
            this.codeMirror.setOption("theme", "monokai");
            //this.codeMirror.setOption("mode", "shell");
            
            // listen for model events
            this.listenTo(this.model, "response", this.responseHandler);
        },
        
        onKeyEvent: function (instance, event) {
            var start = (this._lastMark) ? this._lastMark.find().to : {line: 0, ch: 0},
                line = this.codeMirror.getRange(start, this.endPos());
            
            switch (event.keyCode) {
            case 13:
                this.model.write(line + "\n");
                break;
            case 9:
                // do not write tab char to terminal
                event.preventDefault();
                this.model.write(line + "\t");
                break;
            case 38:
                // do not move cursor up/down
                event.preventDefault();
                this.model.write("\x1bOA");
                break;
            }
            
            return event.defaultPrevented;
        },
        
        endPos: function () {
            var lastLine = this.codeMirror.lastLine(),
                lastText = this.codeMirror.getLine(lastLine);
            
            return {line: lastLine, ch: lastText.length};
        },
        
        responseHandler: function (data, type) {
            // remove the old marker
            if (this._lastMark) {
                this._lastMark.clear();
            }
            
            // append to the end of the terminal
            this.codeMirror.replaceRange(data, this.endPos());
            
            // mark everything but the current prompt as read-only
            this._lastMark = this.codeMirror.markText(
                { line: 0, ch: 0 },
                this.endPos(),
                { inclusiveRight: false, readOnly: true }
            );
        }
    });
    
    var ExtensionPanel = Backbone.View.extend({
        
        el: $(PANEL_TEMPLATE),
        
        events: {
            "click .close": "hide"
        },
        
        initialize: function () {
            $(".main-view .content").append(this.$el);
            
            this.listenTo(terminalCollection, "add", this.addOne);
        },
        
        addOne: function (term) {
            var self = this;
            
            // handle status change events
            term.on("change:status", function (model, status) {
                if (status === Terminal.STATUS_CONNECTED) {
                    var view = new TerminalView({model: term});
                    
                    //FIXME height 100% damn it!
                    //var toolbarHeight = self.$el.find(".toolbar").height();
                    view.render();
                    view.codeMirror.setSize(null, 172);
                    
                    self.$el.find("#terminal-container").append(view.el);
                    
                    if (!self.$el.is(":visible")) {
                        self.show();
                    }
                } else {
                    log("PID status: ", term.get("pid"), status);
                }
            });
            
            // open the terminal immediately
            term.open(ProjectManager.getProjectRoot().fullPath);
        },
        
        show: function () {
            this.$el.show();
            EditorManager.resizeEditor();
        },
        
        hide: function () {
            this.$el.hide();
            EditorManager.resizeEditor();
        }
        
    });
    
    /**
     * Opens a shell for the current project
     */
    function _handleNewTerminal() {
        terminalCollection.add({
            nodeConnection: nodeConnection
        });
    }
    
    AppInit.htmlReady(function () {
        // add bottom panel
        terminalCollection = new TerminalCollection();
        panel = new ExtensionPanel();
        
        ExtensionUtils.addLinkedStyleSheet("thirdparty/CodeMirror2/theme/monokai.css");
        
        ExtensionUtils.loadStyleSheet(module, "styles.css");
    });
    
    AppInit.appReady(function () {
        // connect to node server
        nodeConnection.connect(true).done(function () {
            // load terminal domain
            var path = ExtensionUtils.getModulePath(module, "node/TerminalDomain");
            nodeConnection.loadDomains([path], true).done(function () {
                // register commands
                CommandManager.register("New Terminal", COMMAND_NEW_TERMINAL, _handleNewTerminal);
                
                var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
                menu.addMenuItem(COMMAND_NEW_TERMINAL);
                    
                // register event handlers
                var $nodeConnection = $(nodeConnection);
                
                $nodeConnection.on("terminal.stdout", function (event, pid, data) {
                    var term = terminalCollection.get(pid);
                    term.trigger("response", data, "stdout");
                });
                
                $nodeConnection.on("terminal.stderr", function (event, pid, data) {
                    var term = terminalCollection.get(pid);
                    term.trigger("response", data, "stderr");
                });
                
                $nodeConnection.on("terminal.exit", function (event, pid, data) {
                    var term = terminalCollection.get(pid);
                    
                    // FIXME close vs. exit handling
                    term.trigger("exit", data);
                });
            });
        });
    });

});