Early Eagle Academy Classroom Label Maker — phone-capable prototype

HOW TO TRY IT
1. This is a real mobile-web prototype: the Make a Label control uses the phone browser's camera/file input.
2. To use camera capture on a phone, the page should be served from a secure HTTPS website (rather than opened as a local file). Most phone browsers restrict camera features on local files.
3. Current working features: camera/photo selection, English/Spanish text editing, label preview, locked label-set logic, print queue, browser print/save-PDF.
4. Not yet connected: AI object identification, web product search, automated background removal, cloud label library, automated true-size 8.5x11 PDF imposition. Those require a hosted backend/API services.

LOCKED LABEL SET LOGIC
- Two Matching Labels = 2 Business Card labels (3.5 x 2 in)
- Two Different-Size Labels = 1 Business Card (3.5 x 2 in) + 1 CP Basket (3 x 2.5 in)
- Single Label = choose Business Card or CP Basket
