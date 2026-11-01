# 2-finger gripper

**CAD model: "2-finger robotic gripper mechanism (end effector)" by Hussein Syria, shared on GrabCAD on
September 11th, 2026.** Thank you to the author. The original SolidWorks parts are not in this repository; this
example holds only meshes exported from them (`meshes/`) and the playground's own physics.

This example also shows the whole workflow on a real downloaded assembly:

1. `py tools/sw_export.py examples/gripper` with the assembly open in SolidWorks -> `meshes/*.stl` + mass properties
   (kept as `parts_export.json`). The designer had set no materials (SolidWorks' default 1.0 g/cm³).
2. `prepare.py` -> `parts.json`: groups, materials (aluminium jaws, steel pins; the rest assumed - see the part
   cards), the test object, and the jaw's inner profile for the grip contact.
3. `linkage.js`: the pins, read from the export. Each jaw is the coupler of a four-bar; the slider drives it through
   the small connectors. `sweep_check.py` found the travel: 0 mm (jaws touch, as in the CAD) to 30 mm (the screw
   collar meets the bracket).
4. `mechanism.js`: one DOF (slider travel), a motor with a torque-speed curve on the 3 mm lead screw, a damped test
   object in the jaw notch, the 12-tooth gear turning one tooth per screw turn, `hand.auto` so a jaw or the crank
   can be dragged through the linkage.
5. `test.js`: grip force balance, torque scaling, stops, no bounce on closing.

Build: `py build/build.py examples/gripper` -> `dist/gripper.html`.
