/**
 * Cinnamon Screenshot class to support capture selection and 
 * communication with back-end screencapture program.
 *
 * @author  Robert Adams <radams@artlogic.com>
 * @link    http://github.com/rjanja/desktop-capture/
 */

const Cinnamon = imports.gi.Cinnamon;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;
const Params = imports.misc.params;
const Clutter = imports.gi.Clutter;

const Flashspot = imports.ui.flashspot;
const Lightbox = imports.ui.lightbox;
const Util = imports.misc.util;
const Tweener = imports.ui.tweener;

const Lang = imports.lang;
const St = imports.gi.St;
const Gio = imports.gi.Gio;

const MessageTray = imports.ui.messageTray;

const SelectionType = {
   ALL_WORKSPACES: 0,  /* @todo */
   SCREEN: 1,
   DESKTOP: 2,         /* @todo */
   WINDOW: 3,
   AREA: 4,
   CINNAMON: 5
}

const SOUND_ID = 0;

const SelectionTypeStr = {
   0: "workspaces",
   1: "screen",
   2: "desktop",
   3: "window",
   4: "area",
   5: "cinnamon"
}

function ScreenshotNotification(source, dispatchOp) {
   this._init(source, dispatchOp);
}
ScreenshotNotification.prototype = {
   __proto__: MessageTray.Notification.prototype,

   _init: function(source, title) {
      MessageTray.Notification.prototype._init.call(this, source, title, null, { customContent: true });
      this.setResident(true);
      this.connect('action-invoked', Lang.bind(this, function(self, action) {
         switch (action) {
         case 'decline':

             break;
         case 'accept':

             break;
         }
         this.destroy();

      }));
   }
}

function Source(sourceId, app, window) {
    this._init(sourceId, app, window);
}

Source.prototype = {
   __proto__ : MessageTray.Source.prototype,

   _init: function(sourceId, app, screenshot) {
      MessageTray.Source.prototype._init.call(this, sourceId);
      this._screenshot = screenshot;
      this._app = app;
   },

   createNotificationIcon : function() {
      return new St.Icon({ icon_name: 'camera-photo-symbolic',
         icon_type: St.IconType.FULLCOLOR,
         icon_size: this.ICON_SIZE || 24 });
   },

   clicked : function() {
     global.log('source notification clicked');
     MessageTray.Source.prototype.clicked.call(this);
   }
}

function ScreenshotHelper(selectionType, callback, params) {
   this._init(selectionType, callback, params);
}
ScreenshotHelper.prototype = {
   _init: function(selectionType, callback, params) {
      this._capturedEventId = null;
      this._selectionType = selectionType;
      this._callback = callback;
      this._modifiers = {};
      this._timeout  = 0;
      this._params = {
         filename: '',
         useFlash: true,
         includeFrame: true,
         includeCursor: true,
         includeStyles: true,
         windowAsArea: false,
         copyToClipboard: true,
         playShutterSound: true,
         useTimer: true,
         playTimerSound: true,
         timerDuration: 3,
         soundTimerInterval: 'dialog-warning',
         soundShutter: 'camera-shutter',
         sendNotification: true
      };

      if (params != undefined) {
         this._params = Params.parse(params, this._params);
      }

      global.log("Initializing screenshot tool");

      this._xfixesCursor = Cinnamon.XFixesCursor.get_for_stage(global.stage);

      if (selectionType == SelectionType.WINDOW) {
         this.selectWindow();
      }
      else if (selectionType == SelectionType.AREA) {
         this.selectArea();
      }
      else if (selectionType == SelectionType.CINNAMON) {
         this.selectCinnamon();
      }
      else if (selectionType == SelectionType.SCREEN) {
         this.selectScreen();
      }
   },

   getModifier: function(symbol) {
      //global.log('getModifier ' + symbol);
      global.log(this._modifiers[symbol]);
      return this._modifiers[symbol] || false;
   },

   setModifier: function(symbol, value) {
      //global.log('setModifier ' + symbol + (value ? ' TRUE ' : ' false'));
      this._modifiers[symbol] = value;
   },

   captureTimer: function(options, onFinished, onInterval) {
      if (options.useTimer && options.timerDuration > 0) {
         this._setTimer(options.timerDuration);
         this._fadeOutTimer();

         if (options.playTimerSound)
            global.play_theme_sound(0, options.soundTimerInterval);

         let timeoutId = Mainloop.timeout_add(1000, Lang.bind(this, function() {
            this._timeout--;

            if (onInterval && typeof onInterval == 'function')
               onInterval();

            if (this._timeout > 0) {
               let timeoutText = '';
               if (this._timeout == 1 && Math.floor(Math.random()*101) == 100) {
                  timeoutText = '\u2764';
               }
               else {
                  timeoutText = this._timeout;
               }

               this._timer.set_text('' + timeoutText);

               if (options.playTimerSound)
                  global.play_theme_sound(0, options.soundTimerInterval);

                 this._fadeOutTimer();
            } else {
               //if (options.playShutterSound)
               //   global.play_theme_sound(0, options.soundShutter);

               Mainloop.source_remove(timeoutId);
               onFinished();
               return false;
            }

            return true;
         }));
      }
      else {
         onFinished();
      }
   },

   _setTimer: function(timeout) {
      if (timeout === 0) {
         if (this._timer) {
            Main.uiGroup.remove_actor(this._timer);
            this._timer.destroy();
            this._timer = null;
         }
      } else {
         if (!this._timer) {
            this._timer = new St.Label({
              style_class: 'timer'
            });

            Main.uiGroup.add_actor(this._timer);

            let monitor = global.screen.get_primary_monitor();
            let geom = global.screen.get_monitor_geometry(monitor);
            let [monitorWidth, monitorHeight] = [geom.width, geom.height];

            this._timer.set_position(
              (monitorWidth / 2) - (this._timer.width / 2),
              (monitorHeight / 2) - (this._timer.height / 2)
            );
            this._timer.set_anchor_point_from_gravity(Clutter.Gravity.CENTER);
         }

         this._timer.set_text('' + timeout);
      }

      this._timeout = timeout;
   },

   _fadeOutTimer: function() {
     this._timer.opacity = 255;
     this._timer.scale_x = 1.0;
     this._timer.scale_y = 1.0;

     Tweener.addTween(this._timer, {
         opacity: 0,
         scale_x: 2.5,
         scale_y: 2.5,
         delay: 0.200,
         time: 0.700,
         transition: 'linear'
     });
   },

   /**
    * showSystemCursor:
    * Show the system mouse pointer.
    */
   showSystemCursor: function() {
      this._xfixesCursor.show();
   },

   /**
    * hideSystemCursor:
    * Hide the system mouse pointer.
    */
   hideSystemCursor: function() {
      this._xfixesCursor.hide();
   },

   flash: function(x, y, width, height) {
      let flashspot = new Flashspot.Flashspot({ x : x, y : y, width: width, height: height});
      global.f = flashspot;
      flashspot.fire();
   },

   selectScreen: function() {
      this.screenshotScreen();
   },

   selectCinnamon: function() {
      this._modal = true;
      this._target = null;
      this._pointerTarget = null;
      this._borderPaintTarget = null;
      this._borderPaintId = null;
      this._screenWidth = global.screen_width;
      this._screenHeight = global.screen_height;

      this.container = new Cinnamon.GenericContainer({
         name: 'frame-container',
         reactive: false,
         visible: true,
         x: 0,
         y: 0
      });

      /*this.container = new St.Group({
         reactive: true,
         style_class: 'area-selection-container',
         x_align: St.Align.START,
         y_align: St.Align.START
      });*/

      Main.uiGroup.add_actor(this.container);

      if (!Main.pushModal(this.container)) {
         return;
      }

      this.initializeShadow();
      //this.drawShadows(0, 0, 0, 0);

      let eventHandler = new St.BoxLayout({
         name: 'LookingGlassDialog',
         vertical: false,
         reactive: true
      });

      //this._eventHandler = eventHandler;
      //this.container.add_actor(eventHandler);
      this._displayText = new St.Label();
      //eventHandler.add(this._displayText, { expand: true });

      this.captureTimer(this._params, Lang.bind(this, Lang.bind(this, function() {
         global.set_cursor(Cinnamon.Cursor.POINTING_HAND);
         this._capturedEventId = global.stage.connect('captured-event', Lang.bind(this, this._onCapturedEvent));
      })));


      
      //this.shadowContainer.raise(this.container);

      //this._lightbox = new Lightbox.Lightbox(Main.uiGroup, { fadeTime: 0.5 });
      //this._lightbox.show();
      //this._lightbox.highlight(this.uiContainer);

      //let inspector = new LookingGlass.Inspector();
      //inspector.connect('target', Lang.bind(this, this.screenshotCinnamon));

      /*this.container = new Cinnamon.GenericContainer({
         width: 0,
         height: 0
      });

      container.connect('allocate', Lang.bind(this, this._allocateForCinnamon));*/
   },

   _updateCinnamon: function(event) {
      let [stageX, stageY] = event.get_coords();
      let target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE,
                                                 stageX,
                                                 stageY);

      if (target != this._pointerTarget) {
         this._target = target;
         /*if (this._lightbox) {
            this._lightbox.hide();
            this._lightbox.destroy();
         }
         this._lightbox = new Lightbox.Lightbox(this._target, { fadeTime: 0.5 });
         this._lightbox.show();
         if (this._lightbox) {
            //this._lightbox.highlight(this._target);
         }*/
      }

      this._pointerTarget = target;

      let position = '[inspect x: ' + stageX + ' y: ' + stageY + ']';
      this._displayText.text = '';
      this._displayText.text = position + ' ' + this._target;

      if (this._borderPaintTarget != this._target) {
         if (this.uiContainer) {
            this.clearActorOutline();
         }
         //global.t = this._target;
         this.showActorOutline(this._target, stageX, stageY);

         /*if (this._borderPaintTarget != null) {
            this._borderPaintTarget.disconnect(this._borderPaintId);
         }
         this._borderPaintTarget = this._target;
         this._borderPaintId = addBorderPaintHook(this._target);*/
      }
   },

   _onDestroy: function() {
      this.reset();
   },

   selectArea: function() {
      this._modal = true;
      this._mouseDown = false;
      this._isMoving = false;
      this._isResizing = false;
      this._resizeActor = null;
      this._timeout = 0;
      this._xStart = -1;
      this._yStart = -1;
      this._xEnd = -1;
      this._yEnd = -1;
      this._selectionMade = false;
      this._screenWidth = global.screen_width;
      this._screenHeight = global.screen_height;

      this.container = new St.Group({
         reactive: true,
         style_class: 'area-selection-container',
         x_align: St.Align.START,
         y_align: St.Align.START
      });

      Main.uiGroup.add_actor(this.container);

      if (!Main.pushModal(this.container)) {
         return;
      }

      this.border1 = new St.Bin({ 
         style_class: 'border-h',
         x_fill: true,
         y_fill: false,
         y_align: St.Align.START
      });
      this.border2 = new St.Bin({ 
         style_class: 'border-h',
         x_fill: true,
         y_fill: false,
         y_align: St.Align.END
      });
      this.border3 = new St.Bin({ 
         style_class: 'border-v',
         x_fill: false,
         y_fill: true,
         x_align: St.Align.START,
         y_align: St.Align.START
      });
      this.border4 = new St.Bin({ 
         style_class: 'border-v',
         x_fill: false,
         y_fill: true,
         x_align: St.Align.END,
         y_align: St.Align.START
      });

      this.container.add_actor(this.border1, {expand: false, x_fill: false});
      this.container.add_actor(this.border2, {expand: false, x_fill: false});
      this.container.add_actor(this.border3, {expand: false, x_fill: false});
      this.container.add_actor(this.border4, {expand: false, x_fill: false});

      this.handle1 = new St.Bin({ style_class: 'handle', name: 'handleNw', reactive: true });
      this.handle2 = new St.Bin({ style_class: 'handle', name: 'handleN', reactive: true });
      this.handle3 = new St.Bin({ style_class: 'handle', name: 'handleNe', reactive: true });
      this.handle4 = new St.Bin({ style_class: 'handle', name: 'handleW', reactive: true });
      this.handle5 = new St.Bin({ style_class: 'handle', name: 'handleE', reactive: true });
      this.handle6 = new St.Bin({ style_class: 'handle', name: 'handleSw', reactive: true });
      this.handle7 = new St.Bin({ style_class: 'handle', name: 'handleS', reactive: true });
      this.handle8 = new St.Bin({ style_class: 'handle', name: 'handleSe', reactive: true });

      this.container.add_actor(this.handle1);
      this.container.add_actor(this.handle2);
      this.container.add_actor(this.handle3);
      this.container.add_actor(this.handle4);
      this.container.add_actor(this.handle5);
      this.container.add_actor(this.handle6);
      this.container.add_actor(this.handle7);
      this.container.add_actor(this.handle8);

      this.initializeShadow();
      this.drawShadows(0, 0, 0, 0);

      global.set_cursor(Cinnamon.Cursor.POINTING_HAND);

      this._capturedEventId = global.stage.connect('captured-event', Lang.bind(this, this._onCapturedEvent));

   },

   initializeShadow: function() {
      this.shadowContainer = new St.Group({
         reactive: false,
         style_class: 'shadow-container'
      });
      
      Main.uiGroup.add_actor(this.shadowContainer);

      this.coverLeft = new St.Bin({
         style_class: 'cover',
         x_fill: true,
         y_fill: true
      });
      this.coverRight = new St.Bin({
         style_class: 'cover',
         x_fill: true,
         y_fill: true
      });
      this.coverTop = new St.Bin({
         style_class: 'cover',
         x_fill: true,
         y_fill: true
      });
      this.coverBottom = new St.Bin({
         style_class: 'cover',
         x_fill: true,
         y_fill: true
      });
      
      this.shadowContainer.add_actor(this.coverLeft);
      this.shadowContainer.add_actor(this.coverRight);
      this.shadowContainer.add_actor(this.coverTop);
      this.shadowContainer.add_actor(this.coverBottom);
   },

   selectWindow: function() {
      this._modal = true;
      this._mouseDown = false;
      this._outlineBackground = null;
      this._outlineFrame = null;
      this.bringWindowsToFront = false;

      this.container = new Cinnamon.GenericContainer({
         name: 'frame-container',
         reactive: true,
         visible: true,
         x: 0,
         y: 0
      });

      Main.uiGroup.add_actor(this.container);

      if (!Main.pushModal(this.container)) {
         return;
      }

      this._windows = global.get_window_actors();

      global.set_cursor(Cinnamon.Cursor.POINTING_HAND);

      this._capturedEventId = global.stage.connect('captured-event', Lang.bind(this, this._onCapturedEvent));

      /*let timeoutId = Mainloop.timeout_add(10000, Lang.bind(this, function() {
         this.abort();
         Mainloop.source_remove(timeoutId);
         return false;
      }));*/
   },

   getDefaultFilename: function() {
      let date = new Date();
      let filename = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) + '/'
         + 'screenshot-'
         + this.getSelectionTypeStr() + '-'
         + date.getFullYear() + '-'
         + this._padNum(date.getMonth() + 1) + '-'
         + this._padNum(date.getDate()) + 'T'
         + this._padNum(date.getHours()) + ':'
         + this._padNum(date.getMinutes()) + ':'
         + this._padNum(date.getSeconds())
         + '.png';

      return filename;

   },

   _padNum: function(num) {
      return (num < 10 ? '0' + num : num);
   },

   getSelectionTypeStr: function() {
      return SelectionTypeStr[this._selectionType];
   },

   getParams: function(options) {
      if (options != undefined)
         return Params.parse(this._params, options);

      return this._params;
   },

   getFilename: function(options) {
      if (options['filename'])
         return options.filename;
      else
         return this.getDefaultFilename();
   },

   screenshotScreen: function(options) {
      global.log('screenshotScreen()');

      let opts = this.getParams(options);
      let filename = this.getFilename(opts);

      let screenshot = new Cinnamon.Screenshot();
      screenshot.screenshot (opts.includeCursor, filename,
         Lang.bind(this, function() {
            this.runCallback({
               file: filename,
               options: opts
            });
         }));

      return true;
   },

   screenshotCinnamon: function(actor, stageX, stageY, options) {
      global.log('screenshotCinnamon() [actor,stageX,stageY]');

      if (actor.get_paint_visibility() === false) {
         global.log('Actor is not visible. Cancelling screenshot to prevent empty output.');
         this.reset();
         return false;
      }
      
      // Reset after a short delay so we don't activate the actor we
      // have clicked.
      let timeoutId = Mainloop.timeout_add(200, Lang.bind(this, function() {
         this.reset();
         Mainloop.source_remove(timeoutId);
         return false;
      }));

      let opts = this.getParams(options);
      let filename = this.getFilename(opts);

      // If we don't use a short timer here, we end up capturing any
      // CSS styles we're applying to the selection. So use a short timer,
      // and make it into an option.
      let captureTimer = 200;
      if (opts.includeStyles)
         captureTimer = 0;

      let captureTimeoutId = Mainloop.timeout_add(captureTimer, Lang.bind(this, function() {
         Mainloop.source_remove(captureTimeoutId);

         let [x, y] = actor.get_transformed_position();
         let [width, height] = actor.get_transformed_size();

         // Call capture back-end.
         let screenshot = new Cinnamon.Screenshot();
         screenshot.screenshot_area (opts.includeCursor, x, y, width, height, filename,
            Lang.bind(this, function() {
               this.runCallback({
                  stageX: stageX,
                  stageY: stageY,
                  actor: actor,
                  x: x,
                  y: y,
                  width: width,
                  height: height,
                  file: filename,
                  options: opts
               });
            }));
      }));

      return true;
   },

   screenshotArea: function(x, y, width, height, options) {
      global.log('screenshotArea(' + x + ', ' + y + ', ' + width + ', ' + height + ') [x,y,w,h]');
      this.reset();

      let opts = this.getParams(options);
      let filename = this.getFilename(opts);

      // Call capture back-end.
      let screenshot = new Cinnamon.Screenshot();
      this.captureTimer(opts, Lang.bind(this, function() {
         screenshot.screenshot_area (opts.includeCursor, x, y, width, height, filename,
            Lang.bind(this, function() {
               this.runCallback({
                  x: x,
                  y: y,
                  width: width,
                  height: height,
                  file: filename,
                  options: opts
               });
            }));
      }));

      return true;
   },

   screenshotWindow: function(window, options) {
      if (!window.get_meta_window().has_focus()) {
         let tracker = Cinnamon.WindowTracker.get_default();
         let focusEventId = tracker.connect('notify::focus-app', Lang.bind(this, function() {
             let timeoutId = Mainloop.timeout_add(1, Lang.bind(this, function() {
                 this.screenshotWindow(window, options);
                 Mainloop.source_remove(timeoutId);
                 return false;
             }));

             tracker.disconnect(focusEventId);
         }));

         Main.activateWindow(window.get_meta_window())

         return true;
      }

      // Get the size so we can calculate the outer rectangle area.
      let [sW, sY] = window.get_size();

      let rect = window.get_meta_window().get_outer_rect();
      [width, height, x, y] = [rect.width, rect.height, rect.x, rect.y];

      global.log('screenshotWindow(..) [frame, cursor, flash, filename]');
      this.reset();

      let opts = this.getParams(options);
      let filename = this.getFilename(opts);

      let screenshot = new Cinnamon.Screenshot();

      this.captureTimer(opts, Lang.bind(this, function() {
         if (opts.windowAsArea) {
            screenshot.screenshot_area (opts.includeCursor, x, y, width, height, filename,
               Lang.bind(this, function() {
                  this.runCallback({
                     window: window, x: x, y: y, width: width, height: height,
                     file: filename, options: opts });
               }));
         }
         else {
            screenshot.screenshot_window (opts.includeFrame, opts.includeCursor, filename,
               Lang.bind(this, function() {
                  this.runCallback({
                     window: window, x: x, y: y, width: width, height: height,
                     file: filename, options: opts });
               }));
         }
      }), Lang.bind(this, function() {
         // Make sure we have the right window focused.
         Main.activateWindow(window.get_meta_window())
      }));

      return true;
   },

   runCallback: function(screenshot) {
      screenshot.selectionType = this._selectionType;

      let fileCapture = Gio.file_new_for_path(screenshot.file);
      screenshot.outputFilename = fileCapture.get_basename();
      screenshot.outputDirectory = fileCapture.get_parent().get_path();

      if (this._callback) {
         this._callback(screenshot);
      }

      if (screenshot.options.useFlash) {
         if (this._selectionType == SelectionType.WINDOW
          && screenshot.window.get_meta_window().get_title() != _('Desktop')
          && screenshot.options.padWindowFlash) {
            let pad = 1;
            this.flash(screenshot.x - pad, screenshot.y - pad, screenshot.width + (2*pad), screenshot.height + (2*pad));
         }
         else {
            this.flash(screenshot.x, screenshot.y, screenshot.width, screenshot.height);
         }
      }

      if (screenshot.options.copyToClipboard) {
         St.Clipboard.get_default().set_text(screenshot.file);
      }

      if (screenshot.options.playShutterSound) {
         global.cancel_theme_sound(SOUND_ID);
         global.play_theme_sound(SOUND_ID, 'camera-shutter');
      }

      let source = new Source('capture-rjanja', this, screenshot);
      Main.messageTray.add(source);
      let notification = new ScreenshotNotification(source,
         'Screenshot captured!', null,
         { customContent: true, bodyMarkup: true });

      notification.setResident(true);
      notification.addBody("<b>" + screenshot.outputFilename + "</b> saved to " + screenshot.outputDirectory, true);
      notification.connect('action-invoked',
         Lang.bind(this, function() { global.log('action-invoked'); }));

      notification.connect('clicked', Lang.bind(this,
         function() {
            try {
               Gio.app_info_launch_default_for_uri('file://' + screenshot.outputDirectory,
                  global.create_app_launch_context());
            }
            catch (e) {
               Util.spawn(['gvfs-open', screenshot.outputDirectory]);
            }

            //global.log("clicked on notification!");
      }));

      source.notify(notification);
      return true;
   },

   abort: function() {
      //global.log('abort()');
      this.reset();

      return true;
   },

   reset: function() {
      // Mode-specific resets
      if (this._selectionType == SelectionType.WINDOW) {
         if (this._windowSelected) {
            this.clearWindowOutline();
         }
      }
      else if (this._selectionType == SelectionType.CINNAMON) {
         if (this.uiContainer) {
            this.clearActorOutline();
         }

         if (this._borderPaintTarget != null) {
            this._borderPaintTarget.disconnect(this._borderPaintId);
         }

         if (this._eventHandler) {
            this._eventHandler.destroy();
         }
         this._eventHandler = null;
      }
      
      if (this.shadowContainer) {
         Main.uiGroup.remove_actor(this.shadowContainer);
         this.shadowContainer.destroy();
      }

      if (this._timer) {
         Main.uiGroup.remove_actor(this._timer);
         this._timer.destroy();
         this._timer = null;
      }

      if (this._modal) {
         Main.popModal(this.container);
      }

      if (this._lightbox) {
         this._lightbox.hide();
         this._lightbox.destroy();
      }

      global.unset_cursor();

      this._modal = false;

      if (this.container) {
         Main.uiGroup.remove_actor(this.container);
         this.container.destroy();
      }

      if (this._capturedEventId) {
         global.stage.disconnect(this._capturedEventId);
         this._capturedEventId = null;
      }
   },

   drawBorders: function(width, height) {
      this.border1.set_clip(0, 0, width, 1);
      this.border2.set_clip(0, 0, width, 1);
      this.border3.set_clip(0, 0, 1, height);
      this.border4.set_clip(0, 0, 1, height);

      this.border1.set_position(0, 0);
      this.border1.set_size(width, 1);

      this.border2.set_position(0, height-1);
      this.border2.set_size(width, 1);

      this.border3.set_position(0, 0);
      this.border3.set_size(1, height);

      this.border4.set_position(width-1, 0);
      this.border4.set_size(1, height);

      let handleSize = 10;

      this.handle1.set_position(0, 0);
      this.handle1.set_size(handleSize, handleSize);
      this.handle2.set_position(width/2-(handleSize/2), 0);
      this.handle2.set_size(handleSize, handleSize);
      this.handle3.set_position(width - handleSize, 0);
      this.handle3.set_size(handleSize, handleSize);
      this.handle4.set_position(0, height/2-(handleSize/2));
      this.handle4.set_size(handleSize, handleSize);
      this.handle5.set_position(width - handleSize, height/2-(handleSize/2));
      this.handle5.set_size(handleSize, handleSize);
      this.handle6.set_position(0, height - handleSize);
      this.handle6.set_size(handleSize, handleSize);
      this.handle7.set_position(width/2-(handleSize/2), height - handleSize);
      this.handle7.set_size(handleSize, handleSize);
      this.handle8.set_position(width - handleSize, height - handleSize);
      this.handle8.set_size(handleSize, handleSize);
   },

   drawShadows: function(x, y, width, height) {
      this.coverLeft.set_position(0, 0);
      this.coverLeft.set_size(x, this._screenHeight);

      this.coverRight.set_position(x+width, 0);
      this.coverRight.set_size(this._screenWidth - (x+width), this._screenHeight);

      this.coverTop.set_position(x, 0);
      this.coverTop.set_size(width, y);

      this.coverBottom.set_position(x, y+height);
      this.coverBottom.set_size(width, (this._screenHeight - (y+height)));
   },

   redrawAreaSelection: function(x, y) {
      let width = Math.abs(this._xEnd - this._xStart);
      let height = Math.abs(this._yEnd - this._yStart);

      // Constrain selection area to screen dimensions
      if (x+width > this._screenWidth) x = this._screenWidth - width;
      if (y+height > this._screenHeight) y = this._screenHeight - height;

      this.container.set_position(x, y);
      this.container.set_size(width, height);

      this.drawBorders(width, height);
      this.drawShadows(x, y, width, height);
   },

   _onCapturedEvent: function(actor, event) {
      let type = event.type();

      if (type == Clutter.EventType.KEY_PRESS) {
         let sym = event.get_key_symbol();
         if (sym == Clutter.Escape) {
            global.log("Aborting screenshot.");
            this.abort();
            return true;
         }
         else if (sym == Clutter.Shift_L) {
            this.setModifier(sym, true);
            return true;
         }
         else if (this._selectionType == SelectionType.AREA) {
            if (this._selectionMade && (sym == Clutter.KEY_Return || sym == Clutter.KEY_KP_Enter)) {
               let [x,y] = this.container.get_position();
               let [w,h] = this.container.get_size();
               global.log("Selection area is "+x+","+y+" - " + w + " x " + h);
               this.screenshotArea(x, y, w, h);
               return true;
            }
            else if (this._selectionMade) {
               let isMovementKey = (sym == Clutter.KEY_Up 
                   || sym == Clutter.KEY_Down || sym == Clutter.KEY_Left 
                   || sym == Clutter.KEY_Right);

               if (isMovementKey) {
                  if (this.getModifier(Clutter.Shift_L)) {
                     // Resize selection
                     switch (sym) {
                        case Clutter.KEY_Up:
                           this._yEnd -= 1;
                           break;
                        case Clutter.KEY_Down:
                           this._yEnd += 1;
                           break;
                        case Clutter.KEY_Left:
                           this._xEnd -= 1;
                           break;
                        case Clutter.KEY_Right:
                           this._xEnd += 1;
                           break;
                     }
                  }
                  else {
                     // Move selection
                     switch (sym) {
                        case Clutter.KEY_Up:
                           if (this._yStart > 1) {
                              this._yStart -= 1;
                              this._yEnd -= 1;
                           }
                           break;
                        case Clutter.KEY_Down:
                           if (this._yEnd < this._screenHeight) {
                              this._yStart += 1;
                              this._yEnd += 1;
                           }
                           break;
                        case Clutter.KEY_Left:
                           if (this._xStart > 1) {
                              this._xStart -= 1;
                              this._xEnd -= 1;
                           }
                           break;
                        case Clutter.KEY_Right:
                           if (this._xEnd < this._screenWidth) {
                              this._xStart += 1;
                              this._xEnd += 1;
                           }
                           break;
                     }
                  }

                  let x = Math.min(this._xEnd, this._xStart);
                  let y = Math.min(this._yEnd, this._yStart);
                  this.redrawAreaSelection(x, y);
                  return true;
               }
            }
         }
      }
      else if (type == Clutter.EventType.KEY_RELEASE) {
         let sym = event.get_key_symbol();
         if (sym == Clutter.Shift_L)
         {
            this.setModifier(sym, false);
         }
      }
      else if (type == Clutter.EventType.BUTTON_PRESS) {
         if (event.get_button() != 1) {
             return true;
         }

         let [xMouse, yMouse, mask] = global.get_pointer();

         if (event.get_source() == this.container) {
            //global.log("Clicked on container");
            this._isMoving = true;
            this._mouseDown = true;
            this._xMouse = xMouse;
            this._yMouse = yMouse;
         }
         else if (event.get_source().style_class == 'handle') {
            this._isResizing = true;
            this._mouseDown = true;
            this._resizeActor = event.get_source();
            //global.log('Resizing using handle ' + this._resizeActor.name);
            return true;
         }
         else {
            this._isMoving = false;
            this._mouseDown = true;
            this._xStart = xMouse;
            this._yStart = yMouse;
            this._xEnd = xMouse;
            this._yEnd = yMouse;
         }

         if (this._selectionMade) {
            //global.log("Selection made");
            return true;
         }

         if (this._selectionType == SelectionType.AREA) {
            this.container.set_position(this._xStart, this._yStart);
            this.container.set_size(1, 1);
         }
         else if (this._selectionType == SelectionType.CINNAMON) {
            if (this.getModifier(Clutter.Shift_L))
            {
               if (this._capturedEventId) {
                  global.stage.disconnect(this._capturedEventId);
                  this._capturedEventId = null;
                  global.unset_cursor();

                  let timeoutId = Mainloop.timeout_add(100, Lang.bind(this, function() {
                     global.set_cursor(Cinnamon.Cursor.POINTING_HAND);
                     this._capturedEventId = global.stage.connect('captured-event', Lang.bind(this, this._onCapturedEvent));
                     return false;
                  }));
               }

               return false;
            }
            else if (this._target) {
               let [stageX, stageY] = event.get_coords();
               this.screenshotCinnamon(this._target, stageX, stageY);
               //this.reset();
               return true;
            }
            return true;
         }

      }
      else if (type == Clutter.EventType.MOTION && this._selectionType == SelectionType.WINDOW) {
         let [x, y, mask] = global.get_pointer();

         let windows = this._windows.filter(function(w) {
            let [_w, _h] = w.get_size();
            let [_x, _y] = w.get_position();

            return (w.visible && _x <= x && _x+_w >= x && _y <= y && _y+_h >= y);
         });

         // Sort windows by layer
         windows.sort(function(a, b) {
             return a['get_meta_window'] && b['get_meta_window']
               && a.get_meta_window().get_layer() <= b.get_meta_window().get_layer();
         });

         let titles = windows.map(function(w) {
             if (w['get_meta_window'])
                 return '[' + w.get_meta_window().get_layer() + '] '
                     + w.meta_window.get_wm_class() + ' - '
                     + w.meta_window.get_title();
             else
                 return 'Unknown Cinnamon container';
         });

         let currentWindow = windows[0];

         this._windowSelected = windows[0];
         this.showWindowOutline(this._windowSelected);

         return true;

      }
      else if (type == Clutter.EventType.MOTION && this._selectionType == SelectionType.CINNAMON) {
         this._updateCinnamon(event);
      }
      else if (type == Clutter.EventType.SCROLL && this._selectionType == SelectionType.CINNAMON) {
         switch (event.get_scroll_direction()) {
         case Clutter.ScrollDirection.UP:
            // select parent
            let parent = this._target.get_parent();
            if (parent != null) {
                this._target = parent;
                this._updateCinnamon(event);
            }
            break;

         case Clutter.ScrollDirection.DOWN:
            // select child
            if (this._target != this._pointerTarget) {
                let child = this._pointerTarget;
                while (child) {
                    let parent = child.get_parent();
                    if (parent == this._target)
                        break;
                    child = parent;
                }
                if (child) {
                    this._target = child;
                    this._updateCinnamon(event);
                }
            }
            break;

         default:
            break;
         }
         return true;
      }
      else if (this._mouseDown) {
         if (type == Clutter.EventType.MOTION && this._selectionType == SelectionType.AREA) {
            let [xMouse, yMouse, mask] = global.get_pointer();

            if (xMouse != this._xStart || yMouse != this._yStart) {
               let x, y;
               if (this._isMoving) {
                  //global.log("Moving..");
                  x = Math.min(this._xStart, this._xEnd) - (this._xMouse - xMouse);
                  y = Math.min(this._yStart, this._yEnd) - (this._yMouse - yMouse);

                  // Constrain selection area to screen dimensions
                  if (x < 0) x = 0;
                  if (y < 0) y = 0;
               }
               else if (this._isResizing) {
                  //global.log("Resizing..");
                  let dragName = this._resizeActor.name;
                  if (dragName == 'handleN') {
                     global.log("north handle");
                     this._yStart = yMouse;
                  }
                  else if (dragName == 'handleS') {
                     this._yEnd = yMouse;
                  }
                  else if (dragName == 'handleW') {
                     this._xStart = xMouse;
                  }
                  else if (dragName == 'handleE') {
                     this._xEnd = xMouse;
                  }
                  else if (dragName == 'handleNw') {
                     this._xStart = xMouse;
                     this._yStart = yMouse;
                  }
                  else if (dragName == 'handleNe') {
                     this._xEnd = xMouse;
                     this._yStart = yMouse;
                  }
                  else if (dragName == 'handleSw') {
                     this._xStart = xMouse;
                     this._yEnd = yMouse;
                  }
                  else if (dragName == 'handleSe') {
                     this._xEnd = xMouse;
                     this._yEnd = yMouse;
                  }

                  x = Math.min(this._xEnd, this._xStart);
                  y = Math.min(this._yEnd, this._yStart);

               }
               else {
                  //global.log("Sizing..");
                  this._xEnd = xMouse;
                  this._yEnd = yMouse;
                  x = Math.min(this._xEnd, this._xStart);
                  y = Math.min(this._yEnd, this._yStart);
               }
               
               this.redrawAreaSelection(x, y);
            }
         } else if (type == Clutter.EventType.BUTTON_RELEASE) {
            if (event.get_button() != 1) {
              return true;
            }

            if (this._selectionType == SelectionType.WINDOW) {
               this.screenshotWindow(this._windowSelected);
               return true;
            }
            else if (this._selectionType == SelectionType.AREA) {
               let x = Math.min(this._xEnd, this._xStart);
               let y = Math.min(this._yEnd, this._yStart);
               let width = Math.abs(this._xEnd - this._xStart);
               let height = Math.abs(this._yEnd - this._yStart);

               if (this._isMoving) {
                  this._isMoving = false;
                  this._yMouse = 0;
                  this._xMouse = 0;
                  //global.log("Release xStart= " + this._xStart + ", yStart= " + this._yStart);
               }
               else if (this._isResizing) {
                  this._isResizing = false;
                  this._resizeActor = null;
               }

               [this._xStart, this._yStart] = this.container.get_position();
               [this._xEnd, this._yEnd] = [this._xStart + width, this._yStart + height];
               
               this._mouseDown = false;
               
               //global.log("Area is drawn.");
               this._selectionMade = true;

               //if (this._xEnd == -1 || this._yEnd == -1 || (width < 5 && height < 5)) {
                  //this.screenshotArea(x, y, width, height);
               //}
               return true;
            }
            else if (this._selectionType == SelectionType.CINNAMON) {
               return true;
            }

               //this._prepareWindowScreenshot(this._xStart, this._yStart);
               //this._makeAreaScreenshot(x, y, width, height);
         }
      }

      return true;
   },

   clearActorOutline: function() {
      if (this._lightbox) {
         this._lightbox.hide();
      }

      Main.uiGroup.remove_actor(this.uiContainer);
      this.uiContainer.destroy();

      this.container.remove_actor(this._outlineFrame);
      this._outlineFrame.destroy();
   },

   showActorOutline: function(actor, eventX, eventY) {
      // Create the actor that will serve as background for the clone.
      let frameClass = 'capture-outline-frame';

      let background = new St.Bin();
      this.container.add_actor(background);

      // We need to know the border width so that we can
      // make the background slightly bigger than the clone window.
      let themeNode = background.get_theme_node();
      let borderWidth = themeNode.get_border_width(St.Side.LEFT);// assume same for all sides
      let borderAdj = borderWidth / 2;
      this.container.remove_actor(background);

      let ag = actor.get_allocation_geometry();
      let [width, height] = [ag.width, ag.height];
      let [x, y] = actor.get_transformed_position();

      let childBox = new Clutter.ActorBox();
      childBox.x1 = x;
      childBox.x2 = x + width;
      childBox.y1 = y;
      childBox.y2 = y + height;

      global.cb = childBox;

      // The frame is needed to draw the border round the clone.
      let frame = this._outlineFrame = new St.Bin({style_class: frameClass});
      this.container.add_actor(frame); // must not be a child of the background
      frame.allocate(childBox, 0); // same dimensions

      this.uiContainer = new St.Group({
         reactive: false,
         //visible: false,
         x: x,
         y: y,
         width: width,
         height: height,
         style_class: 'test-container'
      });

      Main.uiGroup.add_actor(this.uiContainer);

      this.drawShadows(x, y, width, height);
   },

   clearWindowOutline: function() {
      if (this._lightbox) {
         this._lightbox.hide();
      }

      Main.uiGroup.remove_actor(this.uiContainer);
      this.uiContainer.destroy();

      
      this.container.remove_actor(this._outlineBackground);
      this._outlineBackground.destroy();
      this._outlineBackground = null;
      
      this.container.remove_actor(this._outlineFrame);
      this._outlineFrame.destroy();

      return true;
   },

   showWindowOutline: function(window) {
      if (this._outlineBackground) {
         this.clearWindowOutline();
      }

      let metaWindow = window.get_meta_window();

      // Create the actor that will serve as background for the clone.
      let binClass = 'capture-outline-background capture-outline-frame';
      let frameClass = 'capture-outline-frame';

      if (metaWindow.get_title() == 'Desktop') {
         binClass += ' desktop';
         frameClass += ' desktop';
      }

      let background = new St.Bin({style_class: binClass});
      this._outlineBackground = background;
      this.container.add_actor(background);
      // Make sure that the frame does not overlap the switcher.
      //background.lower(this._appSwitcher.actor);

      // We need to know the border width so that we can
      // make the background slightly bigger than the clone window.
      let themeNode = background.get_theme_node();
      let borderWidth = themeNode.get_border_width(St.Side.LEFT);// assume same for all sides
      let borderAdj = borderWidth / 2;

      let or = metaWindow.get_outer_rect();
      or.x -= borderAdj; or.y -= borderAdj;
      or.width += borderAdj; or.height += borderAdj;

      let childBox = new Clutter.ActorBox();
      childBox.x1 = or.x;
      childBox.x2 = or.x + or.width;
      childBox.y1 = or.y;
      childBox.y2 = or.y + or.height;
      background.allocate(childBox, 0);

      // The frame is needed to draw the border round the clone.
      let frame = this._outlineFrame = new St.Bin({style_class: frameClass});
      this.container.add_actor(frame); // must not be a child of the background
      frame.allocate(childBox, 0); // same dimensions
      background.lower(frame);

      if (this.bringWindowsToFront) {
         // Show a clone of the target window
         let outlineClone = new Clutter.Clone({source: metaWindow.get_compositor_private().get_texture()});
         background.add_actor(outlineClone);
         outlineClone.opacity = 100; // translucent to get a tint from the background color

         // The clone's rect is not the same as the window's outer rect
         let ir = metaWindow.get_input_rect();
         let diffX = (ir.width - or.width)/2;
         let diffY = (ir.height - or.height)/2;

         childBox.x1 = -diffX;
         childBox.x2 = or.width + diffX;
         childBox.y1 = -diffY;
         childBox.y2 = or.height + diffY;

         outlineClone.allocate(childBox, 0);
      }

      this.uiContainer = new St.Group({
         reactive: true,
         x: or.x,
         y: or.y,
         width: or.width,
         height: or.height,
         style_class: 'test-container',
         x_align: St.Align.MIDDLE,
         y_align: St.Align.MIDDLE
      });

      Main.uiGroup.add_actor(this.uiContainer);

      let tracker = Cinnamon.WindowTracker.get_default();
      let app = tracker.get_window_app(metaWindow);
      let icon = null;
      if (app) {
         icon = app.create_icon_texture(22);
      }
      if (!icon) {
         icon = new St.Icon({ icon_name: 'application-default-icon',
                              icon_type: St.IconType.FULLCOLOR,
                              icon_size: 22, style_class: 'overlay-icon' });
      }

      icon.width = 32;
      icon.height = 32;

      this._iconBin = new St.Bin({
         visible: true,
         reactive: true,
         x_fill: false,
         y_fill: false,
         style_class: 'overlay-iconbox',
         child: icon,
         y_align: St.Align.END
      });

      let sizeInfo = or.width + ' \u00D7 '+or.height;
      let title = new St.Label({ text: metaWindow.get_title(), style_class: 'overlay-test-label' });
      let subtitle = new St.Label({ text: sizeInfo, style_class: 'overlay-size-label' })

      let box = new St.BoxLayout({
         vertical: true,
         width: this.uiContainer.width,
         height: this.uiContainer.height
      });
      box.add(this._iconBin, {expand: true, y_fill: true, y_align: St.Align.END});

      let box2 = new St.BoxLayout({
         vertical: true,
         width: this.uiContainer.width,
         height: 50,
         x_align: St.Align.MIDDLE
      });
      box2.add(title, {expand: true, x_align: St.Align.MIDDLE});
      box2.add(subtitle, {expand: true, x_align: St.Align.MIDDLE});

      box.add(box2, {expand: true, y_fill: false, x_align: St.Align.MIDDLE, y_align: St.Align.START});

      this.uiContainer.add_actor(box);
      box.show();

      return true;

   }
}
