--[[ The plugin's settings in File > Plug-in Manager: the studio key and the standard sections. ]]
local LrView    = import 'LrView'
local LrDialogs = import 'LrDialogs'
local LrTasks   = import 'LrTasks'
local LrBinding = import 'LrBinding'
local Studio    = require 'Studio'

local function sectionsForTopOfDialog(f, propertyTable)
  local prefs = Studio.prefs()
  propertyTable.key = prefs.key or ''
  propertyTable.sections = prefs.sections
  propertyTable:addObserver('key', function(_, _, v) prefs.key = (v or ''):gsub('%s+', '') end)
  propertyTable:addObserver('sections', function(_, _, v) prefs.sections = v end)
  return {
    {
      title = 'Moments Studio',
      bind_to_object = propertyTable,
      f:row {
        f:static_text { title = 'Key:', width = LrView.share 'label' },
        f:password_field { value = LrView.bind 'key', width_in_chars = 40 },
        f:push_button {
          title = 'Test the key',
          action = function()
            LrTasks.startAsyncTask(function()
              local ok, err = Studio.call({ action = 'hello' }, 1)
              if ok then LrDialogs.message('MIL Galleries', 'The key works. You’re connected to Moments Studio.', 'info')
              else LrDialogs.message('MIL Galleries', err or 'That didn’t work.', 'critical') end
            end)
          end,
        },
      },
      f:static_text { title = 'Make a key in the studio: Galleries > Defaults > Make a Lightroom key.', fill_horizontal = 1 },
      f:spacer { height = 8 },
      f:row {
        f:static_text { title = 'Sections:', width = LrView.share 'label' },
        f:edit_field { value = LrView.bind 'sections', height_in_lines = 11, width_in_chars = 30 },
        f:static_text {
          title = 'Your standard collections, one per line, in gallery order.\n\nCreate wedding collections makes these.\nSend to MIL Galleries puts sections in this order\n(any others go after them; each B+W section\nfollows its colour one).',
          height_in_lines = 7,
        },
      },
    },
  }
end

return { sectionsForTopOfDialog = sectionsForTopOfDialog }
