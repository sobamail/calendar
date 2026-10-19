<script lang="ts">
    interface Props {
        name: string;
        size?: number;
    }
    const { name, size = 24 }: Props = $props();

    const PALETTE = [
        "#4180ff",
        "#00c400",
        "#ffa923",
        "#ff4d4d",
        "#2f63d6",
        "#0a7a12",
    ];

    const initials = $derived(
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() ?? "")
            .join(""),
    );
    const color = $derived.by(() => {
        let hash = 0;
        for (let i = 0; i < name.length; i++)
            hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
        return PALETTE[hash % PALETTE.length];
    });
</script>

<span
    class="avatar"
    style:width="{size}px"
    style:height="{size}px"
    style:background={color}
    style:font-size="{Math.round(size * 0.42)}px"
>
    {initials}
</span>

<style>
    .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        color: #fff;
        flex: none;
        box-shadow: var(--ring-ink);
        line-height: 1;
    }
</style>
