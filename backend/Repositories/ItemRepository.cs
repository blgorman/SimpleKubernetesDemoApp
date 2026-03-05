using SimpleKubeDemo.Api.Models;

namespace SimpleKubeDemo.Api.Repositories;

public interface IItemRepository
{
    IEnumerable<Item> GetAll();
    Item? GetById(int id);
}

public class FakeItemRepository : IItemRepository
{
    private static readonly List<Item> _items =
    [
        new(1, "Widget A",    "A reliable everyday widget",    9.99m),
        new(2, "Widget B",    "A premium heavy-duty widget",   24.99m),
        new(3, "Gadget X",    "Compact gadget for on-the-go",  49.99m),
        new(4, "Gadget Y",    "Pro-grade gadget with extras",  99.99m),
        new(5, "Doohickey Z", "Does exactly what you need",    14.99m),
    ];

    public IEnumerable<Item> GetAll() => _items;

    public Item? GetById(int id) => _items.FirstOrDefault(i => i.Id == id);
}
