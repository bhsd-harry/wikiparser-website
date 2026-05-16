-- The trailing `[^0-9]?` ensures that `$10` doesn't potentially change
-- from being treated as `${1}0` to being treated as `${10}`
-- if the number of supported parameters is ever expanded:
local PATTERN = "%$([1-9])[^0-9]?"

local this = {}

function this.renderTmpl(frame)
	local args = frame.args
	local pargs = (frame:getParent() or {}).args
	local input = pargs[0] or ''
	local result = {}

	local prevPos = 1
	do
		local startPos, _, k
		while true do
			startPos, _, k = string.find(input, PATTERN, prevPos)
			if (not startPos) then break end
			table.insert(result, string.sub(input, prevPos, startPos - 1))

			local n = tonumber(k)
			local r = pargs[n]
			if (r) then
				table.insert(result, r)
			else
				table.insert(result, '$' .. n)
			end

			prevPos = startPos + #k + 1
		end
	end

	table.insert(result, string.sub(input, prevPos))
	return table.concat(result)
end

return this
