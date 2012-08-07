#!/bin/bash
sudo cp -f org.cinnamon.applets.capture@rjanja.gschema.xml /usr/share/glib-2.0/schemas/ &&
glib-compile-schemas --dry-run /usr/share/glib-2.0/schemas/ &&
sudo glib-compile-schemas /usr/share/glib-2.0/schemas/

