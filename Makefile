zip-file:
	rm -rf build capture@rjanja.zip
	mkdir build
	cp -ar capture@rjanja/ build/
	#cp install-schema.sh build/
	#cp org.cinnamon.applets.capture@rjanja.gschema.xml build/schemas/
	#glib-compile-schemas build/schemas
	(cd build; zip -qr ../capture@rjanja.zip .)
	rm -rf build