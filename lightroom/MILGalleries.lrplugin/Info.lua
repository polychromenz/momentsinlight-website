--[[
  MIL Galleries: sends a wedding from Lightroom Classic to Moments Studio's client galleries,
  and makes the standard wedding collections. Separate from Tony's Wedding Collection Export
  plugin (which stays as it is for Pic-Time).
  Install: File > Plug-in Manager > Add > choose this MILGalleries.lrplugin folder.
  Then paste the key from Studio > Galleries > Defaults into this plugin's settings there.
]]
return {
  LrSdkVersion = 10.0,
  LrSdkMinimumVersion = 6.0,
  LrToolkitIdentifier = 'nz.momentsinlight.galleries',
  LrPluginName = 'MIL Galleries',
  LrPluginInfoProvider = 'PluginInfo.lua',

  -- Library > Plug-in Extras (and File > Plug-in Extras)
  LrLibraryMenuItems = {
    { title = 'Send to MIL Galleries...',        file = 'SendGallery.lua' },
    { title = 'Create wedding collections...',   file = 'CreateCollections.lua' },
  },
  LrExportMenuItems = {
    { title = 'Send to MIL Galleries...',        file = 'SendGallery.lua' },
    { title = 'Create wedding collections...',   file = 'CreateCollections.lua' },
  },

  VERSION = { major = 1, minor = 0, revision = 0 },
}
