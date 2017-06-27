zip-file:
	rm -rf build capture@rjanja.zip
	mkdir build
	git stash -u || true
	cp -ar capture@rjanja/ build/
	(cd build; zip -qr ../capture@rjanja.zip .)
	rm -rf build
	git stash pop || true
