# Makefile
build: venv
	venv/bin/python swimsets.py

venv: venv/bin/activate

venv/bin/activate: requirements.txt
	test -d venv || virtualenv venv
	venv/bin/pip install -Ur requirements.txt
	touch venv/bin/activate

test: venv
	venv/bin/mypy swimsets.py

# --- web editor ------------------------------------------------------------

# serve web/ on http://localhost:8000 (it also opens fine straight from disk)
serve:
	cd web && python3 -m http.server 8000

# the JS port renders every workout exactly as swimsets.py does
web-parity: venv
	mkdir -p .check
	venv/bin/python web/tools/reference.py > .check/reference.txt
	node web/tools/parity.mjs .check/reference.txt

# every workout survives import -> export -> swimsets.py unchanged
web-roundtrip: venv
	mkdir -p .check
	venv/bin/python web/tools/reference.py > .check/reference.txt
	node web/tools/roundtrip.mjs .check/exported
	venv/bin/python web/tools/reference.py .check/exported > .check/roundtrip.txt
	python3 web/tools/compare.py .check/reference.txt .check/roundtrip.txt

web-test: web-parity web-roundtrip

clean:
	rm -rf .check

.PHONY: build venv test serve web-parity web-roundtrip web-test clean
