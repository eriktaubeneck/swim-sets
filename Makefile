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
