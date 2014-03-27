var geo = {};
$(function() {

	geo.init = function() {
		geo.canvas = $('#mycanvas')[0];
		geo.context = geo.canvas.getContext('2d');

		geo.hazards = [];
		
		geo.nodes = {};

		geo.arcs = [];
	};

	/*
		@param id - String
		@param coords - Object {
			x : integer,
			y : integer
		}
	*/
	geo.node = function(id,coords) {
		this.id = id;
		this.coords = coords;
		this.marker = new geo.circle(coords,5);
		this.arcs = [];
		this.successors = [];
		this.predecessors = [];

		this.marker.draw();
	};
	
	/*
		@param start - Object {
			x : integer,
			y : integer
		}
		@param end - Object {
			x : integer,
			y : integer
		}
		@return InstanceOf Object (line)
	*/
	geo.arc = function(start,end) {
		var self = new geo.line(start.coords,end.coords);
		self.getHazards = function() {
			var path = this;
			//Foreach hazard - check if this path intersects
			$(geo.hazards).each(function(){
				var intersection = this.circle.checkIntersection(path);

				//If we have found an intersection add hazard to path hazards array
				if (intersection) {
					path.hazards.push({hazard:this,intersection:intersection});
				}
			});

			this.calculateHazards();
		}
		self.calculateHazards = function() {
			var path = this;
			$(this.hazards).each(function(){
				var intersect = new geo.intersection(this.intersection.start,this.intersection.end,'#cc0000');
				//If more than 1 increment things get tricky
				if (this.hazard.increments > 1) {
					var totalInnerDistance = 0;
					$(this.hazard.segments).each(function(){
						var innerIntersect;
						if ( innerIntersect = this.checkIntersection(path) ) {
							//Get the intersect for this segment
							innerIntersect = new geo.intersection(innerIntersect.start,innerIntersect.end,'#cc0000');
							
							//The distance of the entire segment
							var innerDistance = innerIntersect.line.distance;
							
							//If we have already weighted part of the path, remove if from this segment
							var weightableDistance = innerDistance - totalInnerDistance;
							
							//Add our new distance to the global var
							totalInnerDistance += weightableDistance;
														
							//Apply weighting to this segment
							path.updateWeighting(weightableDistance,this.weighting)
						}			
					});
				}
				else {
					path.updateWeighting(intersect.line.distance,this.hazard.weighting);
				}
			});
		}
		self.updateWeighting = function(distance,weighting) {
			//Minus the distance as the unweighted version has already been applied
			this.distance += ( distance * weighting ) - distance;
		}
		self.startNode = start;
		self.endNode = end;
		self.draw();
		self.getHazards();
		return self;
	};

	/*
		@param start - Object {
			x : integer,
			y : integer
		}
		@param end - Object {
			x : integer,
			y : integer
		}
	*/
	geo.line = function(start,end,colour) {
		this.hazards = [];
		this.start = start;
		this.end = end;
		//m = (y2 - y1) / (x2 - x1)
		this.gradient = ( end.y - start.y ) / ( end.x - start.x );		
		//c = y - mx
		this.yIntersect = start.y - ( this.gradient * start.x );
		/*
			Pythagoras theorem
			a^2 + b^2 = c^2
			Therefore square root of a^2 + b^2 must equal c
		*/
		this.distance = Math.sqrt( Math.pow(end.x - start.x,2) + Math.pow(end.y - start.y,2) );
		
		this.draw = function() {
			/*
				Canvas place (0,0) at top left whereas mathematics places it bottom left
				Convert the canvas output to start at bottom left
			*/
			geo.context.moveTo(start.x,geo.canvas.height - start.y);
			geo.context.lineTo(end.x,geo.canvas.height - end.y);
			geo.context.stroke();
		}		
	};

	/*
		@param id - String
		@param center - Object {
			x : integer,
			y : integer
		}
		@param radius - Numeric / Integer / Float
		@param increments - Integer
		@param weighting - Numeric / Integer / Float
			!!Should be larger than 1 if truly a hazard!!
	*/
	geo.hazard = function(id,center,radius,increments,weighting,degradation) {
		this.id = id;
		this.weighting = weighting;
		this.increments = increments;
		//Get a reference to outer ring
		//TODO: Reconsider whether this is necessary
		this.circle = new geo.circle(center,radius);
		this.segments = [];
		
		var weighting = this.weighting;
		//So loop through each increment
		//Create zones - smallest radius first - largest weighting first
		for (var i=1; i<=increments; i++) {
			this.segments.push(new geo.zone(center,radius/increments*i,weighting));
			weighting = weighting * degradation;
		}
	};

	/*
		@param center - Object {
			x : integer,
			y : integer
		}
		@param radius - Numeric / Integer / Float
		@param weighting - Numeric / Integer / Float
	*/
	geo.zone = function(center,radius,weighting) {
		self = new geo.circle(center,radius);
		self.weighting = weighting;
		return self;
	};

	/*
		@param center - Object {
			x : integer,
			y : integer
		}
		@param radius - Numeric / Integer / Float
	*/
	geo.circle = function(center,radius,fillColor) {
		this.center = center;
		this.radius = radius;
		this.checkIntersection = function(path) {
			/*
				WARNING: Complicated Maths to follow
				-----------------------------------------

				Equation of straight path:
					y = mx + c
				where m is the gradient of the path and c is the intersect with the y axis

				Equation of a circle:
					r^2 = (x - p)^2 + (y - q)^2
				where r is the radius of the circle and (p,q) is the centre

				Substituting for y
					r^2 = (x - p)^2 + (mx + c - q)^2

				Expanding the brackets
					r^2 = x^2 - p^2 - px - px + mx^2 + c^2 + q^2 + mxc + mxc - mxq - mxq - cq - cq
				Simplifying
					r^2 = x^2 - p^2 - 2px + mx^2 + c^2 + q^2 + 2mxc - 2mxq - 2cq
				Grouping by x
					r^2 = (m + 1)x^2 + (2p + 2mc - 2mq)x + (c^2 + q^2 - p^2 - 2cq)
				Moving radius accross to rhs
					0 = (m + 1)x^2 + (2p + 2mc - 2mq)x + (c^2 + q^2 - r^2 - p^2 - 2cq)

				This is in the format of the quadratic formula:
					Ax^2 + Bx + C = 0

				Hence finding the values of A , B & C
			*/
			var A = Math.pow(path.gradient,2) + 1;
			var B = 2 * ( ( path.gradient * path.yIntersect ) - ( path.gradient * this.center.y ) - this.center.x );
			var C = Math.pow(this.center.y,2) - Math.pow(this.radius,2) + Math.pow(this.center.x,2) - ( 2 * path.yIntersect * this.center.y ) + Math.pow(path.yIntersect,2);
			
			/*
				The following segment of the quadratic formula can be used to detect if a path intersects a circle
					B^2 - 4AC
				If this equates to greater than 0 then there are 2 intersecting points
					* Equal to 0 - tangent to path (TODO: Consider counting this as a match)
					* Less than 0 - No points of intersection
			*/
			var pointsIntersect = Math.pow(B,2) - ( 4 * A * C );
			if ( pointsIntersect > 0 ) {					
				/*
					The full quadratic formula is as follows

						x = -B +||- sqrt ( B^2 - 4AC )
							__________________________
										2A

					Hence finding the possible values of x
				*/

				x1 = ( -B + Math.sqrt(pointsIntersect) ) / (2 * A);
				x2 = ( -B - Math.sqrt(pointsIntersect) ) / (2 * A);
				
				//Calculate y values using y = mx + c
				y1 = ( path.gradient * x1 ) + path.yIntersect;
				y2 = ( path.gradient * x2 ) + path.yIntersect;

				//Hmm have to do something incase the path starts / terminates within hazard
				//TODO: Refine code
				var start,end;
				//If point is on the line - use the point
				if ( between(x1,path.start.x,path.end.x) ) {
					start = {x:x1,y:y1};
				}
				//Otherwise - if x coord is less than starting coord and gradient is positive use start coord
				else if ( x1 < path.start.x && path.gradient > 0 ) {
					start = {x:path.start.x,y:path.start.y};
				}
				else {
					start = {x:path.end.x,y:path.end.y};
				}

				if ( between(x2,path.start.x,path.end.x) ) {
					end = {x:x2,y:y2};
				}
				else if ( x2 > path.end.x && path.gradient > 0 ) {
					end = {x:path.end.x,y:path.end.y};
				}
				else {
					end = {x:path.start.x,y:path.start.y};	
				}
				
				return {start:start,end:end};
			}
			return 0;
		}
		this.draw = function() {
			geo.context.beginPath();
			geo.context.arc(center.x,geo.canvas.height - center.y,radius,0,2*Math.PI);
			
			if (fillColor) {
				geo.context.fillStyle = fillColor;
				geo.context.fill();				
			}
			else {
				geo.context.stroke();
			}
		}
		this.draw();
	};

	/*
		@param start - Object {
			x : integer,
			y : integer
		}
		@param end - Object {
			x : integer,
			y : integer
		}
	*/
	geo.intersection = function(start,end,colour) {		
		this.line = new geo.line(start,end,colour);
		this.line.draw();
		this.showMarkers = function() {
			new geo.circle(start,5,'#cc0000'),
			new geo.circle(end,5,'#cc0000')
		}
		
		this.showMarkers();
	};

	geo.init();

	console.log(geo);
});

var between = function(test,lowBound,highBound) {
	//Check both ways incase lowBound is higher than high bound
	if ( (test > lowBound && test < highBound) || (test < lowBound && test > highBound ) ) {
		return 1;
	}
	return 0;
}