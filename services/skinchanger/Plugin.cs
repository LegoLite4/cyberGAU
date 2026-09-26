using System.Text.Json;
using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes;
using CounterStrikeSharp.API.Modules.Utils;

namespace CybergauSkins;

public sealed class SkinItem
{
    [JsonPropertyName("paint")]
    public int Paint { get; set; }

    [JsonPropertyName("wear")]
    public float Wear { get; set; }

    [JsonPropertyName("seed")]
    public int Seed { get; set; }

    [JsonPropertyName("defindex")]
    public int Defindex { get; set; }

    [JsonPropertyName("classname")]
    public string Classname { get; set; } = "";
}

public sealed class Loadout
{
    [JsonPropertyName("weapons")]
    public Dictionary<string, SkinItem> Weapons { get; set; } = new();

    [JsonPropertyName("knife")]
    public SkinItem? Knife { get; set; }

    [JsonPropertyName("gloves")]
    public SkinItem? Gloves { get; set; }
}

public sealed class PluginConfig
{
    public string ApiBase { get; set; } = "http://10.77.0.1:3000/backend";
}

[MinimumApiVersion(300)]
public sealed class CybergauSkinsPlugin : BasePlugin
{
    public override string ModuleName => "cyberGAU skins";
    public override string ModuleVersion => "1.0.0";
    public override string ModuleAuthor => "cyberGAU";
    public override string ModuleDescription => "Applies the linked Steam inventory on cyberGAU servers.";

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(4) };
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly HashSet<string> _pending = new();
    private string _apiBase = "http://10.77.0.1:3000/backend";

    public override void Load(bool hotReload)
    {
        _apiBase = ReadConfig().ApiBase.TrimEnd('/');
        Console.WriteLine("[cyberGAU] skins loaded");
        RegisterEventHandler<EventPlayerSpawn>(OnSpawn);
        AddCommand("css_skins", "Refresh cyberGAU skins", (player, _) =>
        {
            if (player == null || !player.IsValid || player.IsBot) return;
            QueueApply(player, announce: true);
        });
    }

    private PluginConfig ReadConfig()
    {
        try
        {
            var path = Path.Combine(ModuleDirectory, "config.json");
            if (!File.Exists(path)) return new PluginConfig();
            return JsonSerializer.Deserialize<PluginConfig>(File.ReadAllText(path), JsonOptions) ?? new PluginConfig();
        }
        catch (Exception error)
        {
            Console.WriteLine($"[cyberGAU] config: {error.Message}");
            return new PluginConfig();
        }
    }

    private HookResult OnSpawn(EventPlayerSpawn @event, GameEventInfo _)
    {
        var player = @event.Userid;
        if (player == null || !player.IsValid || player.IsBot || player.AuthorizedSteamID == null) return HookResult.Continue;
        AddTimer(0.6f, () =>
        {
            if (!player.IsValid || player.PlayerPawn.Value == null || !player.PawnIsAlive) return;
            QueueApply(player, announce: false);
        });
        return HookResult.Continue;
    }

    private void QueueApply(CCSPlayerController player, bool announce)
    {
        var authorized = player.AuthorizedSteamID;
        if (authorized == null || authorized.SteamId64 == 0) return;
        var steamId = authorized.SteamId64.ToString();
        if (!_pending.Add(steamId)) return;
        _ = Task.Run(async () =>
        {
            Loadout? loadout = null;
            string? failure = null;
            try
            {
                var body = await Http.GetStringAsync($"{_apiBase}/skins/loadout?steamId={steamId}");
                loadout = JsonSerializer.Deserialize<Loadout>(body, JsonOptions);
            }
            catch (Exception error)
            {
                failure = error.Message;
            }

            Server.NextFrame(() =>
            {
                _pending.Remove(steamId);
                if (!player.IsValid) return;
                if (failure != null)
                {
                    Console.WriteLine($"[cyberGAU] loadout {steamId}: {failure}");
                    if (announce) player.PrintToChat(" [cyberGAU] Не удалось получить скины");
                    return;
                }
                Apply(player, loadout ?? new Loadout());
                if (announce) player.PrintToChat(" [cyberGAU] Скины обновлены");
            });
        });
    }

    private static void Apply(CCSPlayerController player, Loadout loadout)
    {
        try
        {
            if (loadout.Knife != null && !string.IsNullOrWhiteSpace(loadout.Knife.Classname))
            {
                ReplaceKnife(player, loadout.Knife);
            }
            PaintWeapons(player, loadout);
            if (loadout.Gloves != null) ApplyGloves(player, loadout.Gloves);
        }
        catch (Exception error)
        {
            Console.WriteLine($"[cyberGAU] apply: {error.Message}");
        }
    }

    private static void PaintWeapons(CCSPlayerController player, Loadout loadout)
    {
        var services = player.PlayerPawn.Value?.WeaponServices;
        if (services == null) return;
        foreach (var handle in services.MyWeapons)
        {
            var weapon = handle.Value;
            if (weapon == null || !weapon.IsValid) continue;
            var name = weapon.DesignerName ?? "";
            if (name.Contains("knife") || name.Contains("bayonet")) continue;
            if (!loadout.Weapons.TryGetValue(name, out var skin)) continue;
            Paint(weapon, skin);
        }
    }

    private static void ReplaceKnife(CCSPlayerController player, SkinItem knife)
    {
        var services = player.PlayerPawn.Value?.WeaponServices;
        if (services == null) return;
        var names = new List<string>();
        foreach (var handle in services.MyWeapons)
        {
            var weapon = handle.Value;
            if (weapon == null || !weapon.IsValid) continue;
            var name = weapon.DesignerName ?? "";
            if (name.Contains("knife") || name.Contains("bayonet")) names.Add(name);
        }
        foreach (var name in names)
        {
            var servicesNow = player.PlayerPawn.Value?.WeaponServices;
            if (servicesNow == null) break;
            foreach (var handle in servicesNow.MyWeapons)
            {
                var weapon = handle.Value;
                if (weapon == null || !weapon.IsValid) continue;
                if ((weapon.DesignerName ?? "") == name) weapon.Remove();
            }
        }
        var created = player.GiveNamedItem<CBasePlayerWeapon>(knife.Classname);
        if (created != null && created.IsValid) Paint(created, knife);
    }

    private static void Paint(CBasePlayerWeapon weapon, SkinItem skin)
    {
        weapon.FallbackPaintKit = skin.Paint;
        weapon.FallbackSeed = skin.Seed;
        weapon.FallbackWear = skin.Wear;
        var item = weapon.AttributeManager.Item;
        item.ItemID = 16384;
        item.ItemIDLow = 16384;
        item.ItemIDHigh = 0;
        item.Initialized = true;
    }

    private static void ApplyGloves(CCSPlayerController player, SkinItem gloves)
    {
        var pawn = player.PlayerPawn.Value;
        if (pawn == null || !pawn.IsValid) return;
        var item = pawn.EconGloves;
        item.ItemDefinitionIndex = (ushort)gloves.Defindex;
        item.ItemID = 16384;
        item.ItemIDLow = 16384;
        item.ItemIDHigh = 0;
        item.Initialized = true;
        pawn.EconGlovesChanged = 1;
        Utilities.SetStateChanged(pawn, "CCSPlayerPawn", "m_EconGloves", 0);
    }
}
