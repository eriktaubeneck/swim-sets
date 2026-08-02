# Makefile
build: venv
	venv/bin/python swimsets.py

print: venv
	venv/bin/python swimsets.py --print

text: venv
	venv/bin/python swimsets.py --text

venv: venv/bin/activate

venv/bin/activate: requirements.txt
	test -d venv || virtualenv venv
	venv/bin/pip install -Ur requirements.txt
	touch venv/bin/activate

test: venv
	venv/bin/mypy swimsets.py render.py
