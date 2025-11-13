local p = require(arg[1])
local frame = require('frame')

function frame.getParent(f)
	return frame._parent
end

mw = {ustring = string}
function mw.getCurrentFrame()
	return frame
end

print(p[arg[2]](frame))
