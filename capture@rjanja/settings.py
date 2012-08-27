#!/usr/bin/python

'''
Settings app for Cinnamon Desktop Capture applet
@author Rob Adams <radams@artlogic.com>
'''

try:
    import os
    import json
    import collections
    import string
    import gettext
    from gi.repository import Gio, Gtk, GObject
    import gconf
    import pprint
except Exception, detail:
    print detail
    sys.exit(1)

from gettext import gettext as _

support_file = os.path.dirname(os.path.abspath(__file__)) + "/support.json"
settings_file = os.path.dirname(os.path.abspath(__file__)) + "/settings.json"

def which(program):
    import os
    def is_exe(fpath):
        return os.path.isfile(fpath) and os.access(fpath, os.X_OK)

    fpath, fname = os.path.split(program)
    if fpath:
        if is_exe(program):
            return program
    else:
        for path in os.environ["PATH"].split(os.pathsep):
            exe_file = os.path.join(path, program)
            if is_exe(exe_file):
                return exe_file

    return None

def load_support():
    f = open(support_file, 'r')
    support = json.loads(f.read(), object_pairs_hook=collections.OrderedDict)
    f.close()
    
    return support

def load_settings():
    f = open(settings_file, 'r')
    settings = json.loads(f.read(), object_pairs_hook=collections.OrderedDict)
    f.close()
    
    return settings

def get_settings_key(key):
    return settings[key]

def set_settings_key(key, value):
    settings[key] = value
    save_settings()
    return True

def save_settings():
    f = open(settings_file, 'w')
    f.write(json.dumps(settings, sort_keys=False, indent=3))
    f.close()

class MyWindow(Gtk.Window):
    def camera_changed(self, widget):
        tree_iter = widget.get_active_iter()
        if tree_iter != None:
            model = widget.get_model()
            value = model[tree_iter][1]
            set_settings_key('camera-program', value)
            self.cameraApp = value
            if value == "cinnamon":
              self.set_camera_tab(True)
            else:
              self.set_camera_tab(False)
            self.maybe_show_tabs()

    def recorder_changed(self, widget):
        tree_iter = widget.get_active_iter()
        if tree_iter != None:
            model = widget.get_model()
            value = model[tree_iter][1]
            set_settings_key('recorder-program', value)
            self.recorderApp = value
            if value == "cinnamon":
              self.pipeline_input.set_sensitive(True)
              self.set_recorder_tab(True)
            else:
              self.pipeline_input.set_sensitive(False)
              self.set_recorder_tab(False)
            self.maybe_show_tabs()

    def fps_changed(self, widget):
        fps = widget.get_value()
        crSettings.set_int('framerate', fps)

    def pipeline_changed(self, widget):
        pipeline = widget.get_text()
        crSettings.set_string('pipeline', pipeline)

    def camera_save_dir_changed(self, widget):
        save_dir = widget.get_filename()
        if save_dir != self.cameraSaveDir:
           set_settings_key('camera-save-dir', save_dir)
           self.cameraSaveDir = save_dir

    def recorder_save_dir_changed(self, widget):
        save_dir = widget.get_filename()
        if save_dir != self.recorderSaveDir:
           set_settings_key('recorder-save-dir', save_dir)
           self.recorderSaveDir = save_dir

    def set_camera_tab(self, status=False):
        page = self.builder.get_object('boxPage2')
        page.set_sensitive(status)

    def set_recorder_tab(self, status=False):
        page = self.builder.get_object('boxPage3')
        page.set_sensitive(status)

    def maybe_show_tabs(self):
        if self.cameraApp != "cinnamon" and self.recorderApp != "cinnamon":
           self.notebook.set_show_tabs(False)
           return False
        else:
           self.notebook.set_show_tabs(True)
           return True

    def notebook_page_changed(self, notebook, page, page_num):
        set_settings_key('last-selected-page', page_num)

    def notebook_subpage_changed(self, notebook, page, page_num):
        set_settings_key('last-selected-subpage', page_num)

    def checkbox_toggled(self, button):
        buttonId = Gtk.Buildable.get_name(button)
        settingsKey = self.checkboxMap[buttonId]
        set_settings_key(settingsKey, button.get_active())

    def __init__(self):
        self.builder = Gtk.Builder()
        self.builder.add_from_file(os.path.dirname(os.path.abspath(__file__)) + "/settings.ui")
        self.window = self.builder.get_object("main_window")
        self.button_cancel = self.builder.get_object("button_cancel")
        self.dropdown_camera = self.builder.get_object("dropdown_camera")
        self.dropdown_recorder = self.builder.get_object("dropdown_recorder")
        self.fps_spin = self.builder.get_object("fps_spin")
        self.pipeline_input = self.builder.get_object("pipeline_input")
        self.camera_save_dir = self.builder.get_object("camera_save_dir")
        self.recorder_save_dir = self.builder.get_object("recorder_save_dir")
        self.notebook = self.builder.get_object("notebook")
        self.notebookCamera = self.builder.get_object("notebookCamera")

        self.camera_save_name = self.builder.get_object("camera_save_prefix")
        self.recorder_save_name = self.builder.get_object("recorder_save_prefix")

        self.window.connect("destroy", Gtk.main_quit)
        self.button_cancel.connect("clicked", Gtk.main_quit)

        self.notebook.connect("switch-page", self.notebook_page_changed)
        self.notebookCamera.connect("switch-page", self.notebook_subpage_changed)

        # Get current application choices from settings
        self.cameraApp = get_settings_key('camera-program')
        self.recorderApp = get_settings_key('recorder-program')
        fps = crSettings.get_int('framerate')
        pipeline = crSettings.get_string('pipeline')
        self.cameraSaveDir = get_settings_key('camera-save-dir')
        self.recorderSaveDir = get_settings_key('recorder-save-dir')
        self.cameraSavePrefix = get_settings_key('camera-save-prefix')
        self.recorderSavePrefix = get_settings_key('recorder-save-prefix')

        self.camera_save_name.set_text(self.cameraSavePrefix)
        self.recorder_save_name.set_text(self.recorderSavePrefix)

        self.checkboxes = {}
        self.checkboxMap = {
            'cb_window_as_area': 'capture-window-as-area',
            'cb_include_window_frame': 'include-window-frame',
            'cb_camera_flash': 'use-camera-flash',
            'cb_show_timer': 'show-capture-timer',
            'cb_play_shutter_sound': 'play-shutter-sound',
            'cb_play_interval_sound': 'play-timer-interval-sound',
            'cb_copy_clipboard': 'copy-to-clipboard',
            'cb_send_notification': 'send-notification',
            'cb_mod_timer': 'mod-activates-timer',
            'cb_include_styles': 'include-styles'
        }

        for x in self.checkboxMap:
            currentSetting = get_settings_key(self.checkboxMap[x])
            self.checkboxes[x] = self.builder.get_object(x)
            self.checkboxes[x].set_active(currentSetting)
            self.checkboxes[x].connect("toggled", self.checkbox_toggled)

        lastPage = get_settings_key('last-selected-page')
        lastSubPage = get_settings_key('last-selected-subpage')

        self.fps_spin.set_value(fps)
        self.fps_spin.connect('changed', self.fps_changed)
        self.pipeline_input.set_text(pipeline)
        self.pipeline_input.connect('changed', self.pipeline_changed)
        self.camera_save_dir.unselect_all()

        self.camera_save_dir.set_current_folder(self.cameraSaveDir)
        self.camera_save_dir.connect('current-folder-changed', self.camera_save_dir_changed)
        
        self.recorder_save_dir.set_current_folder(self.recorderSaveDir)
        self.recorder_save_dir.connect('current-folder-changed', self.recorder_save_dir_changed)

        # Load camera options into combobox
        self.camera_list_store = Gtk.ListStore(GObject.TYPE_STRING, GObject.TYPE_STRING)
        self.camera_list_store.append([_('None'), 'none'])

        i = 1
        useIndex = 0
        for x in support['camera']:
           if which(x) != None and support['camera'][x]['enabled'] == True:
             self.camera_list_store.append([support['camera'][x]['title'], x])

             if x == self.cameraApp:
                 useIndex = i
             i = i + 1

        if self.cameraApp != "cinnamon":
           self.set_camera_tab(False)

        self.dropdown_camera.set_model(self.camera_list_store)
        self.dropdown_camera.set_active(useIndex)

        cell = Gtk.CellRendererText()
        self.dropdown_camera.pack_start(cell, True)
        self.dropdown_camera.add_attribute(cell, "text", 0)
        self.dropdown_camera.connect('changed', self.camera_changed)

        # Load recorder options into combobox
        self.recorder_list_store = Gtk.ListStore(GObject.TYPE_STRING, GObject.TYPE_STRING)
        self.recorder_list_store.append([_('None'), 'none'])
        i = 1
        useIndex = 0
        useRecorderProrgram = None
        for x in support['recorder']:
           if which(x) != None and support['recorder'][x]['enabled'] == True:
             self.recorder_list_store.append([support['recorder'][x]['title'], x])

             if x == self.recorderApp:
                 useIndex = i
             i = i + 1

        if self.recorderApp != "cinnamon":
           self.set_recorder_tab(False)

        self.maybe_show_tabs()

        self.notebook.set_current_page(lastPage)
        self.notebookCamera.set_current_page(lastSubPage)

        self.dropdown_recorder.set_model(self.recorder_list_store)
        self.dropdown_recorder.set_active(useIndex)

        cell = Gtk.CellRendererText()
        self.dropdown_recorder.pack_start(cell, True)
        self.dropdown_recorder.add_attribute(cell, "text", 0)
        self.dropdown_recorder.connect('changed', self.recorder_changed)

        self.window.show()

if __name__ == "__main__":
    settings = load_settings()
    crSettings = Gio.Settings.new('org.gnome.shell.recorder')
    support = load_support()

    MyWindow()
    Gtk.main()

