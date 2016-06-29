/* Blob-related variables */
var blobSize = 12,	// blob radius on screen
	blobDensity = 1.0/1700, //  (blobs_areas) / available_area
 	blobFactor = 20, // how much size increases by eating a blob
 	blobs = [],	// store positions of blobs
 	sizeup = 0; // extra size gained by eating blobs... to be sent to server!! 

/* Intervals, rates and timings */
var send_interval = 60,			// sending input to server 
 	blob_gen_interval = 30000;	    // new blob-set generating

/* Other variables */
var players = [];
var ip_address = "localhost", port = "8080";
var colors = ["magenta", "yellow", "purple", "pink", "chartreuse", "orange", "aqua", "bronze", "red"];
var wrdWidth = 2000*3, wrdHeight = 2000*3;
var conn;
var inSeq = 0, inBuff = [];
var ease_step = 0.45, ease_spd = 10;
var lastTime, times = 60, ms = 1000.0 / times, delta = 0.0;	
var xshift, yshift;
var batch_size = 30;		// how many user inputs to handle and send each frame  TODO: tweak

/************************************************/
function Organ(xpos, ypos, size, xSpd, ySpd) {
	this.lock = false;		// prevent organs from going apart
	this.x = xpos;
	this.y = ypos;
	this.xspd = xSpd;
	this.yspd = ySpd;
	this.size = size;
	this.authPos = [];			// authoritative positions
	this.color = colors[Math.floor((Math.random() * colors.length))];
	// Easing variables
	this.applySizeEase = false;
	this.massDelta = 0.0;
	this.applyPosEase = false;
	this.easeDist = 0.0;
	this.easex = 0.0;
	this.easey = 0.0;
}

Organ.prototype.move = function(){
	this.x += this.xspd;
	this.y += this.yspd;
};

Organ.prototype.update = function () {
	this.move();
	var dt = 1.0/times;
	if(this.applyPosEase){	
		this.x += (ease_spd*dt*ease_step*this.easeDist) * this.easex;
		this.y += (ease_spd*dt*ease_step*this.easeDist) * this.easey;
		this.easeDist -= ease_spd*dt*ease_step*this.easeDist;
		if(Math.abs(this.easeDist) <= 0.001)
			this.applyPosEase = false;
	}
	
	if(this.applySizeEase){
		this.size += ease_spd*dt*this.massDelta*ease_step;
		this.massDelta -= ease_spd*dt*this.massDelta*ease_step;
		if(Math.abs(this.massDelta) <= 0.001)
			this.applySizeEase = false;
	}
};

Organ.prototype.easePos = function(xdir, ydir) {
	this.easex = xdir;
	this.easey = ydir;
	this.easeDist = this.size*20;				// TODO: tweak this
	this.applyPosEase = true;
};

Organ.prototype.easeSize = function(mass_delta) {
	this.massDelta = mass_delta;
	this.applySizeEase = true;
};

Organ.prototype.split = function() {

	this.easeSize(-this.size/2.0);

	var org2 = new Organ(this.x, this.y, this.size/2,
	 		   this.xspd, this.yspd);
	var norm = Math.sqrt((org2.xspd*org2.xspd) + (org2.yspd*org2.yspd));
	org2.easePos(org2.xspd/norm, org2.yspd/norm);

	return org2;
};

Organ.prototype.draw = function (context) {
	context.beginPath();
	context.arc(this.x - xshift, this.y - yshift, this.size, 0,2*Math.PI);
	context.fillStyle = this.color;
	context.fill();		
};

/************************************************/

function Player(player_id) {
	this.pid = player_id;
	this.organs = []
	this.cmx = 0;		// center of mass (CM), the point equidistant from all organs
	this.cmy = 0;
	this.directX = 0;	// direction in which CM is headed
	this.directY = 0;
}

Player.prototype.restrict = function(){	// restrict organs movements
	// after the organs are packed, they can't keep going in their direction, they have to start going in the CM direction
	for(var i = 0; i < this.organs.length; i++) {
		var org = this.organs[i];
		if(org.lock && (org.applyPosEase == false) && (org.applyPosEase == false)) {
			var mag = Math.sqrt(org.xspd*org.xspd + org.yspd*org.yspd);
			var ang = Math.atan2( this.directY, this.directX);
			org.xspd = Math.cos(ang) * mag;
			org.yspd = Math.sin(ang) * mag;

		}
	}

	// check for collision between mp's organs
	for(var i = 0; i < this.organs.length-1; i++) {
		var org1 = this.organs[i];
		for(var j = i+1; j < this.organs.length; j++){
			var org2 = this.organs[j];

			var radSum = org2.size+org1.size;		// sum of radii
			var distSqr = distSq(org1.x, org1.y, org2.x, org2.y);	// distance between centers squared

			if( Math.pow(radSum, 2) + 0.5>  distSqr) {		// if there's an intersection 

				var interleave = radSum - Math.sqrt(distSqr);	// how much are the two circles intersecting?  r1 + r2 - distnace
				
				// create a vector o12 going from org1 to org2
				// push the two organs apart, push org2 in the direction of the o12, and org1 in the opposite direction of o12
				var o12x = org2.x - org1.x,	o12y = org2.y - org1.y;
				var o12ang = Math.atan2(o12y,o12x);
				// the exact distnace each one will be pushed(from its original location) is interleave/2
				org2.x += Math.cos(o12ang) * (interleave/2);
				org2.y += Math.sin(o12ang) * (interleave/2);
				org1.x += Math.cos(o12ang) * (-interleave/2);
				org1.y += Math.sin(o12ang) * (-interleave/2);

				org1.lock = true;
				org2.lock = true;
			}

		}

	}


};

function calCM (pl) {
	var avgX = 0.0, avgY = 0.0;
	var count = pl.organs.length;

	for(var i=0; i < count; i++) {
		avgX += pl.organs[i].x;
		avgY += pl.organs[i].y;
	}

	pl.cmx = avgX/count;
	pl.cmy = avgY/count;
}

/************************************************/

function Point (x,y,col) {
	this.x = x;
	this.y = y;
	this.color = col;
	this.ang = Math.random()*Math.PI;
}

//-----------------------------------------------------------------------------------------------------------//

window.onload = function() {
	var canvas = document.getElementById("canvas"),
		context = canvas.getContext("2d"),
		width = canvas.width = window.innerWidth,
		height = canvas.height = window.innerHeight;
	var ready = false;

	generateBlobs();
	
	var mp = new Player(-1);		// main player
	mp.x = -1,
	mp.y = -1;

	Connect();
	run();
	



    /*****************  FUNCTIONS  *****************/

function Connect(){
	conn = new WebSocket('ws://'+ip_address+':'+port);
	conn.onopen = function(e) {
		console.log("Connected to server");
	};

	conn.onclose = function(e) {
		ready = false;
	    setTimeout(Connect, 5000);
	};

	var fst_msg = true;
	conn.onmessage = function(e) {

		// if this is the first msg:
		if(fst_msg) {	
			var init_data = String(e.data).split(',');
			myid = parseInt(init_data[0]);
			mp.organs.push(new Organ(1,1,38,5,5));
			mp.organs[0].x = parseFloat(init_data[1]);
			mp.organs[0].y = parseFloat(init_data[2]);
			mp.organs[0].size = parseFloat(init_data[3]);
			// add a center of mass property to mp
			mp.cmx = mp.organs[0].x;						
			mp.cmy = mp.organs[0].y; 

			console.log(parseFloat(init_data[1])+","+parseFloat(init_data[2]));
			fst_msg = false;
			ready = true;
			lastTime = performance.now();
			return;
		}
		return;
		/*// if it's not the first msg:
		var e_str = String(e.data);
		var str_array = e_str.split(';');
		
		players = [];
		for (var i=0; i<str_array.length; i++) {
			if(str_array[i]=="") continue;

			var plyr_data = str_array[i].split(',');
			var tempPlayer = new Player_data( parseInt(plyr_data[0]), parseFloat(plyr_data[1]),
											 parseFloat(plyr_data[2]), parseFloat(plyr_data[3]) );
			// if this message is for main player:
			if(tempPlayer.pid == myid) { 			// TODO fix this part, multiple organs can share the same id. there shouldnt be a single x,y and size, but one for each organ
				x = tempPlayer.x;
				y = tempPlayer.y;
				size = tempPlayer.size;
			} 
			// if it's not, update players[]
			else players.push(tempPlayer);
		}*/

	};
}

	document.body.addEventListener("mousemove", function(event) {
		inBuff.push(
			{	
				seq : inSeq,
				xdir : event.clientX-(width/2.0),
				ydir : event.clientY-(height/2.0),
				inType : "mm"
			});
		inSeq++;
	});

	document.body.addEventListener("mousedown", function(event) {
		inBuff.push({	
			seq : inSeq,
			xdir : event.clientX-(width/2.0),
			ydir : event.clientY-(height/2.0),
			inType : "md"
		});
		inSeq++;
	});


	function generateBlobs() {
		var world_area = wrdWidth*wrdHeight;
		var available_area = world_area;// - size;
		/* blob_count * blobSize / available_area = density  */
		var blob_count = (blobDensity * available_area) / blobSize;
		//console.log(blob_count);
		blobs = [];
		for (var i = 0; i < blob_count; i++) {
			//var pos_mag = size + 10 - (wrdWidth/2) + Math.random()*wrdWidth ;  
			//var pos_angle = 2*Math.PI* Math.random();
			//blobs.push(  new Point(pos_mag*Math.cos(pos_angle), pos_mag*Math.sin(pos_angle), colors[Math.floor((Math.random() * colors.length))])  );
			blobs.push( new Point(-(wrdWidth/2) + wrdWidth*Math.random(), -(wrdHeight/2) + wrdHeight*Math.random(), colors[Math.floor((Math.random() * colors.length))]) );
		}
	}

	// draw a polygon with given sides and radius(for the circumscribing circle) 
	function drawCircle(x,y,rad,sides,col,start) {
		var ang = 2*Math.PI/sides;
		var cur = start;

		context.beginPath();
		context.moveTo(x+ rad*Math.cos(cur), y+rad*Math.sin(cur));
		for(var i=0; i<sides; i++) {
			context.lineTo(x+ rad*Math.cos(cur+ang), y+rad*Math.sin(cur+ang));
			cur += ang;
		}	
		context.closePath();
		context.fillStyle = col;	
		context.fill();
	}


	function run() {		// Main game-loop function
		if(ready) {
			var batchSize = batch_size;
			while(batchSize > 0 && inBuff.length>0) {
				var input = inBuff.shift();			// shift() removes the first element.... as in Queues
				//send(input);		TODO: enable later
				process(input);
				batchSize--;
			}

			var now = performance.now();
		    delta += (now - lastTime) / ms;  // detla += actual elapsed time / time required for 1 update 
			lastTime = now;

			if(delta >= 1) { 
				for(var i=0; i<mp.organs.length; i++) 
					mp.organs[i].update();
						
				mp.restrict();	

				calCM(mp);
				delta--;
			}

			context.clearRect(0, 0, width, height);
			xshift = mp.cmx - width/2;
			yshift = mp.cmy - height/2; 
			drawGrid();
			drawBlobs();
			for(var i=0; i<mp.organs.length; i++) 
				mp.organs[i].draw(context);
		
		}

		else{		
			context.fillStyle = '#333333';
            context.fillRect(0, 0, width, height);

            context.textAlign = 'center';
            context.fillStyle = '#FFFFFF';
            context.font = 'bold 30px sans-serif';
			context.fillText('Connecting to server...', width/2, height/2);
			//if(conn.readState != 1 || conn == null)
			//	conn = new WebSocket('ws://'+ip_address+':'+port);
		}

		requestAnimationFrame(run);
	}

	function send(input) {
		if(input)
			conn.send(input.inSeq+","+input.inType+","+input.xdir+","+input.ydir);
	}

	function process(input) {
		var tempOrgans = [];
		for(var i=0; i < mp.organs.length; i++) {
			// each orgnas will try to move towards the mouse pointer, but later when the orgnas are packed together, they'll go in CM direction
			var xspd = mp.organs[i].xspd;
			var yspd = mp.organs[i].yspd;
			var mag = Math.sqrt(xspd*xspd + yspd*yspd);
			var ang = Math.atan2( (input.ydir+height/2) - (mp.organs[i].y-yshift),			// the direction angle from the organ to the mouse location
								  (input.xdir+width/2)  - (mp.organs[i].x -xshift)  );

			mp.organs[i].xspd = Math.cos(ang) * mag;
			mp.organs[i].yspd = Math.sin(ang) * mag;

			mp.directX = input.xdir;
			mp.directY = input.ydir;

			if(input.inType == 'md')
				tempOrgans.push(mp.organs[i].split());
		}

		for(var i=0; i < tempOrgans.length; i++) 
			mp.organs.push(tempOrgans[i]);
	}

	function drawGrid() {
		var maxX = wrdWidth/2, maxY = wrdHeight/2;	
		var ulx = 2 -xshift -maxX,
			uly = 2 -yshift- maxY,
			urx = wrdWidth -xshift-maxX,
			ury = 2 -yshift-maxY,
			dlx = 2 -xshift-maxX,
			dly = wrdHeight -yshift-maxY,
			drx = wrdWidth -xshift-maxX,
			dry = wrdHeight -yshift-maxY;
		context.beginPath();
		context.moveTo(ulx,uly);
		context.lineTo(dlx,dly);
		context.stroke();
		context.beginPath();
		context.moveTo(ulx,uly);
		context.lineTo(urx,ury);
		context.stroke();
		context.beginPath();
		context.moveTo(urx,ury);
		context.lineTo(drx,dry);
		context.stroke();
		context.beginPath();
		context.moveTo(drx,dry);
		context.lineTo(dlx,dly);
		context.stroke();
	}

	function drawBlobs() {
		for (var i = 0; i < blobs.length; i++)
			drawCircle(blobs[i].x - xshift, blobs[i].y - yshift,
					blobSize, 6, blobs[i].color, blobs[i].ang);
	}

	function sizeToSpd(sz) {
		return sz/10;
	}


}

function distSq(x1,y1,x2,y2){
	return (x2-x1)*(x2-x1) + (y2-y1)*(y2-y1);
}


function compUV(ux,uy,vx,vy){		// component of u along v
	var udotu = ux*vx + uy*vy;
	var vdotv = vx*vx + vy*vy;
	var scaler = udotu/vdotv;
	return {
		xcomp : vx*scaler,
		ycomp : vy*scaler
	};
}