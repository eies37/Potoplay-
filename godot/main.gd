extends Control

# Lanceur Potoplay : ouvre l'URL du serveur Salon Arcade dans le navigateur/WebView.
# Le serveur (node server.js) doit tourner sur un appareil du même Wi-Fi/hotspot.

const SETTINGS_PATH := "user://settings.cfg"
const DEFAULT_URL := "http://192.168.43.1:8080"

var url_edit: LineEdit
var status_label: Label

func _ready() -> void:
	var vbox := VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(vbox)

	var title := Label.new()
	title.text = "🕹️ Potoplay\nSalon Arcade"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 42)
	vbox.add_child(title)

	var hint := Label.new()
	hint.text = "URL du serveur (même Wi-Fi que ce téléphone) :"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(hint)

	url_edit = LineEdit.new()
	url_edit.custom_minimum_size = Vector2(560, 70)
	url_edit.text = _load_url()
	url_edit.placeholder_text = DEFAULT_URL
	vbox.add_child(url_edit)

	var btn := Button.new()
	btn.text = "▶  JOUER"
	btn.custom_minimum_size = Vector2(560, 90)
	btn.add_theme_font_size_override("font_size", 28)
	btn.pressed.connect(_on_play)
	vbox.add_child(btn)

	status_label = Label.new()
	status_label.text = "Astuce : l'hôte partage le lien « 🔗 invitation » (avec le code du salon)."
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(status_label)

	# Option : ouvrir directement si une URL est déjà enregistrée et ?auto=1
	var q := OS.get_cmdline_user_args()
	if q.has("auto") and _load_url() != "":
		_on_play()

func _load_url() -> String:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) == OK:
		return str(cfg.get_value("server", "url", ""))
	return DEFAULT_URL if OS.has_environment("POTOPLAY_DEFAULT_URL") == false else DEFAULT_URL

func _save_url(url: String) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("server", "url", url)
	cfg.save(SETTINGS_PATH)

func _on_play() -> void:
	var url := url_edit.text.strip_edges()
	if not (url.begins_with("http://") or url.begins_with("https://")):
		url = "http://" + url
	if not url.ends_with("/"):
		url += "/"
	_save_url(url)
	status_label.text = "Ouverture de " + url + " …"
	# Ouvre dans le navigateur système (fiable partout). Pour une WebView intégrée,
	# ajoute un plugin WebView (AssetLib) et remplace par webview.load_url(url).
	OS.shell_open(url)
