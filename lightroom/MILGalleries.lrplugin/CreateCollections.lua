--[[ Library > Plug-in Extras > Create wedding collections: makes the standard collections
     (from the plugin's settings) in this catalog, or inside the selected collection set.
     Collections that already exist are left alone. ]]
local LrApplication     = import 'LrApplication'
local LrDialogs         = import 'LrDialogs'
local LrFunctionContext = import 'LrFunctionContext'
local LrTasks           = import 'LrTasks'
local Studio            = require 'Studio'

LrTasks.startAsyncTask(function()
  LrFunctionContext.callWithContext('MIL create collections', function()
    local catalog = LrApplication.activeCatalog()
    local names = Studio.sectionList()
    -- Inside the selected collection set, if one is selected.
    local parent
    for _, src in ipairs(catalog:getActiveSources()) do
      if src.type and src:type() == 'LrCollectionSet' then parent = src break end
    end
    local where = parent and ('the collection set “' .. parent:getName() .. '”') or 'this catalog'
    local answer = LrDialogs.confirm('Create wedding collections',
      'Make these collections in ' .. where .. '?\n\n' .. table.concat(names, '\n') .. '\n\n(Ones that already exist are left as they are. Change the list in File > Plug-in Manager > MIL Galleries.)',
      'Create them', 'Cancel')
    if answer ~= 'ok' then return end
    local made = 0
    catalog:withWriteAccessDo('Create wedding collections', function()
      for _, name in ipairs(names) do
        local _, existed = nil, false
        local children = parent and parent:getChildCollections() or catalog:getChildCollections()
        for _, c in ipairs(children) do if c:getName() == name then existed = true end end
        if not existed then
          catalog:createCollection(name, parent, true)
          made = made + 1
        end
      end
    end)
    LrDialogs.message('Create wedding collections', made == 0 and 'They were all there already.' or (made .. ' collection' .. (made == 1 and '' or 's') .. ' made.'), 'info')
  end)
end)
