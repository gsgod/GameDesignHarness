extends SceneTree

func _initialize() -> void:
	var manifest_path := ""
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--manifest="):
			manifest_path = argument.trim_prefix("--manifest=")
	if manifest_path.is_empty():
		quit(2)
		return
	var manifest = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
	if not manifest is Dictionary or not manifest.get("assets") is Array:
		quit(2)
		return
	for asset in manifest.assets:
		var bitmap := Image.new()
		if bitmap.load(manifest_path.get_base_dir().path_join(asset.file)) != OK:
			quit(3)
			return
		if bitmap.get_width() != asset.width or bitmap.get_height() != asset.height:
			quit(4)
			return
	print("HARNESS_IMPORT_OK ", manifest.assets.size())
	quit(0)
