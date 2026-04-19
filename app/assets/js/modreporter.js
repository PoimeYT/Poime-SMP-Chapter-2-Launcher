const path = require('path')
const got  = require('got')
const { LoggerUtil } = require('helios-core')
const DropinModUtil = require('./dropinmodutil')

const logger = LoggerUtil.getLogger('ModReporter')

// Set your Discord webhook URL here
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1495257350670647326/i_kgOeAzs-L1WTWSa7wBNJ7MOVufDIM-3fvMK_mdEqHbBF3EKvV8ENJ_qMewnNz_qLi8'

/**
 * Scan the drop-in mods folder and report the list to a Discord webhook.
 * Fires-and-forgets — never throws, so a webhook failure won't block launch.
 *
 * @param {string} instancesDir Root instances directory from ConfigManager
 * @param {string} serverId     The selected server id
 * @param {string} mcVersion    Minecraft version string (e.g. "1.20.1")
 * @param {string} playerName   The authenticated player's display name
 */
exports.reportMods = function(instancesDir, serverId, mcVersion, playerName) {
    if (!WEBHOOK_URL || WEBHOOK_URL === 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
        logger.warn('ModReporter: webhook URL not configured, skipping report.')
        return
    }

    const modsDir = path.join(instancesDir, serverId, 'mods')
    let mods = []
    try {
        mods = DropinModUtil.scanForDropinMods(modsDir, mcVersion)
    } catch (err) {
        logger.error('ModReporter: failed to scan mods directory.', err)
        return
    }

    if (mods.length === 0) {
        // Nothing extra installed — still report so you have a clean record
        mods = []
    }

    const modLines = mods.length > 0
        ? mods.map(m => `• \`${m.name}\` (${m.disabled ? 'disabled' : 'enabled'})`)
        : ['_No extra mods installed_']

    // Split mod list into ≤1024-char chunks to stay within Discord field limits
    const chunks = []
    let current = ''
    for (const line of modLines) {
        const next = current ? current + '\n' + line : line
        if (next.length > 1024) {
            chunks.push(current)
            current = line
        } else {
            current = next
        }
    }
    if (current) chunks.push(current)

    const modFields = chunks.map((chunk, i) => ({
        name: i === 0 ? `Drop-in Mods (${mods.length})` : '\u200b',
        value: chunk
    }))

    const embed = {
        title: `Mod Report — ${playerName}`,
        color: mods.some(m => !m.disabled) ? 0xe74c3c : 0x2ecc71,
        fields: [
            { name: 'Player',  value: playerName, inline: true },
            { name: 'Server',  value: serverId,   inline: true },
            { name: 'Version', value: mcVersion,  inline: true },
            ...modFields
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Launcher mod check' }
    }

    got.post(WEBHOOK_URL, {
        json: { embeds: [embed] },
        responseType: 'json'
    }).catch(err => {
        logger.error('ModReporter: webhook POST failed.', err.message)
    })
}
