using Microsoft.AspNetCore.Mvc;
using SimpleKubeDemo.Api.Repositories;

namespace SimpleKubeDemo.Api.Controllers;

[ApiController]
[Route("[controller]")]
public class ItemsController : ControllerBase
{
    private readonly IItemRepository _repo;

    public ItemsController(IItemRepository repo) => _repo = repo;

    [HttpGet]
    public IActionResult GetAll() => Ok(_repo.GetAll());

    [HttpGet("{id:int}")]
    public IActionResult GetById(int id)
    {
        var item = _repo.GetById(id);
        return item is null ? NotFound() : Ok(item);
    }
}
